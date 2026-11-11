// Long Haul: the run you watch. The rules have already decided who is left
// standing (Game.play()); this plays it out in about six seconds: the squad
// runs in, drowsers shuffle in from the right and get bonked, whoever was
// fated to go down goes down near the end, and everyone still standing lifts
// a crate over their head: one star each.
//
// It is a little timeline: a sorted list of { t, fn } events and a frame loop
// that moves the drowsers. Skipping is the same timeline at forty times the
// speed with the sound off, so the picture at the end is always the same.

import { CAST, CLASSES, AREAS } from './config.js';
import { figureSvg, drowserSvg, DROWSERS_BY_AREA, OL } from './figures.js';
import { backdropSvg, STAGE } from './area-art.js';
import { icon } from './icons.js';
import { face, esc, wait, tapOn } from './ui.js';
import { mulberry32 } from './util.js';
import { buzz } from './fx.js';

/** Where the three stand: a slanting line, so nobody hides behind anybody (back lane, middle, front). */
const POSTS = [
  { x: 262, lane: 0 },
  { x: 346, lane: 1 },
  { x: 178, lane: 2 },
];
const WALK = 185; // drowser speed, units a second
const SHOT = { rifle: 'rifle', revolver: 'pistol', stapler: 'staple', tcannon: 'thump', nailgun: 'staple', harpoon: 'rifle' };
const REACH = { rifle: 75, revolver: 59, stapler: 58, tcannon: 70, nailgun: 67, harpoon: 90 };

const BANNERS = ['NOBODY’S CARRYING ANYTHING', 'ONE CRATE COMING HOME', 'TWO CRATES COMING HOME', 'EVERYONE’S STANDING!'];

export class RunView {
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx; // { sfx, fx, tuning }
  }

  /**
   * Play `res` (what Game.play() returned). Resolves when it is over.
   * @param canSkip a tap fast-forwards to the end
   */
  async play(res, { canSkip = true } = {}) {
    const { sfx, fx, tuning } = this.ctx;
    const area = AREAS[res.area];
    const bd = backdropSvg(area.id);
    const rnd = mulberry32(res.run * 7717 + 31);
    const root = this.root;
    root.innerHTML =
      `<div class="run a-${area.id}">` +
      `<svg class="run-svg" viewBox="0 0 ${STAGE.w} ${STAGE.h}" preserveAspectRatio="xMinYMax slice" aria-hidden="true">` +
      `<g class="bd-back">${bd.back}</g>` +
      `<g class="run-ents"><g class="lane"></g><g class="lane"></g><g class="lane"></g></g>` +
      `<g class="run-fx"></g>` +
      `<g class="bd-front">${bd.front}</g>` +
      `</svg>` +
      `<div class="run-top"><div class="run-title"><b>${esc(area.name)}</b><span>${icon('danger')}${Math.round(area.danger * tuning.danger)}</span></div>` +
      `<div class="run-squad">${res.squad.map((id, i) => `<span class="rs" data-i="${i}">${face(id)}<i></i></span>`).join('')}</div></div>` +
      `<div class="run-stars">${[0, 1, 2].map(() => `<span class="rstar">${icon('starOff')}${icon('star')}</span>`).join('')}</div>` +
      `<div class="run-banner"></div>` +
      (canSkip ? `<div class="run-skip">Tap to skip</div>` : '') +
      `</div>`;
    root.classList.add('open');
    const el = root.firstChild;
    const svg = el.querySelector('.run-svg');
    const lanes = [...el.querySelectorAll('.lane')];
    const fxLayer = el.querySelector('.run-fx');
    const NS = 'http://www.w3.org/2000/svg';
    // How much of the scene's width is on screen (it is cropped on the right).
    const box = root.getBoundingClientRect();
    const visW = Math.min(STAGE.w, (box.width / Math.max(1, box.height)) * STAGE.h);
    const spawnX = visW + 70;

    let speed = 1;
    let muted = false;
    const play = (name, opts) => {
      if (!muted) sfx.play(name, opts);
    };
    const mk = (lane, x, y, html, cls = '') => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `ent ${cls}`);
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y})`);
      g.innerHTML = html;
      lanes[lane].appendChild(g);
      return g;
    };
    const spark = (x, y, big = false) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', `hit${big ? ' big' : ''}`);
      g.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)})`);
      g.innerHTML = `<path d="M0,-17 L5,-6 L17,-9 L9,1 L15,12 L3,8 L-3,18 L-6,7 L-17,8 L-9,-1 L-14,-12 L-3,-7 Z" fill="#fff6c8" stroke="${OL}" stroke-width="2.5" stroke-linejoin="round"/>`;
      fxLayer.appendChild(g);
      setTimeout(() => g.remove(), 260 / speed);
    };
    const tracer = (x1, y1, x2, y2) => {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('class', 'tracer');
      p.setAttribute('d', `M${x1},${y1} L${x2.toFixed(1)},${y2}`);
      fxLayer.appendChild(p);
      setTimeout(() => p.remove(), 110 / speed);
      const f = document.createElementNS(NS, 'g');
      f.setAttribute('class', 'flash');
      f.setAttribute('transform', `translate(${x1},${y1})`);
      f.innerHTML = `<path d="M0,-9 L5,-3 L16,0 L5,3 L0,9 L-3,3 L-8,0 L-3,-3 Z" fill="#ffe08a" stroke="${OL}" stroke-width="2"/>`;
      fxLayer.appendChild(f);
      setTimeout(() => f.remove(), 90 / speed);
    };

    // --- The cast of this run ---------------------------------------------------------------
    const kinds = DROWSERS_BY_AREA[area.id] || DROWSERS_BY_AREA.suburbia;
    const squad = res.squad.map((id, i) => {
      const post = POSTS[i];
      const y = STAGE.lanes[post.lane];
      const c = CAST[id];
      const g = mk(post.lane, -80 - i * 40, y, figureSvg(id, 'walk'), 'surv walking');
      return { id, i, x: post.x, y, lane: post.lane, g, melee: CLASSES[c.cls].melee, prop: c.look.prop, dog: !!c.look.dog, standing: res.standing[i], state: 'in', poseT: 0 };
    });
    const setPose = (s, pose) => {
      if (s.state === 'down' && pose !== 'down') return;
      s.g.innerHTML = figureSvg(s.id, pose);
    };
    const drowsers = [];
    const events = [];
    const at = (t, fn) => events.push({ t, fn });

    // The squad runs in.
    for (const s of squad) {
      at(0, () => {
        s.g.animate([{ transform: `translate(${-80 - s.i * 40}px,${s.y}px)` }, { transform: `translate(${s.x}px,${s.y}px)` }], { duration: 520 / speed, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
      });
      at(0.55, () => {
        s.state = 'ready';
        s.g.classList.remove('walking');
        for (const a of s.g.getAnimations()) a.cancel();
        s.g.setAttribute('transform', `translate(${s.x},${s.y})`);
        setPose(s, 'idle');
      });
    }

    const fallen = squad.filter((s) => !s.standing);
    const END = 3.9;
    fallen.forEach((s, k) => {
      s.fallT = (fallen.length === 3 ? 2.3 : 2.6) + k * 0.5;
    });

    /**
     * A drowser who is dropped by `s` at time `tk`. Its walk is worked back
     * from there, so the ones due early are already out in the street when
     * the scene opens, and the rest come in from the right.
     */
    const victim = (s, tk, n) => {
      const hitX = s.melee ? s.x + (s.dog ? 78 : 64) : Math.min(spawnX - 90, s.x + 190 + rnd() * 230);
      const v = WALK * (0.85 + rnd() * 0.3);
      const t0 = tk - (spawnX - hitX) / v;
      const d = { x0: spawnX, v, t0, stopX: hitX - 2, lane: s.lane, y: s.y, g: null, alive: true, kind: kinds[n % kinds.length], n: Math.floor(rnd() * 3) };
      drowsers.push(d);
      const swing = s.melee ? 0.13 : 0;
      if (s.melee) at(tk - swing, () => s.state === 'ready' && (s.dog ? lunge(s) : setPose(s, 'windup')));
      at(tk, () => {
        if (s.state !== 'ready') return;
        if (s.melee) {
          if (!s.dog) setPose(s, 'strike');
          play('hit', { heavy: CAST[s.id].cls === 'bruiser' });
        } else {
          setPose(s, 'aim');
          tracer(s.x + (REACH[s.prop] || 60), s.y - 50, d.x - 4, s.y - 56);
          play('shot', { kind: SHOT[s.prop] || 'pistol' });
        }
        s.poseT = tk + 0.17;
        drop(d, tk);
      });
      at(tk + 0.18, () => s.state === 'ready' && s.poseT <= tk + 0.171 && setPose(s, 'idle'));
    };
    const lunge = (s) => {
      s.g.animate([{ transform: `translate(${s.x}px,${s.y}px)` }, { transform: `translate(${s.x + 34}px,${s.y - 12}px)`, offset: 0.45 }, { transform: `translate(${s.x}px,${s.y}px)` }], { duration: 300 / speed, easing: 'ease-out' });
    };
    const drop = (d, t) => {
      if (!d.alive || !d.g) return;
      d.alive = false;
      d.g.innerHTML = drowserSvg(d.kind, d.n, 'down');
      d.g.classList.remove('walking');
      d.g.classList.add('dropped');
      spark(d.x - 6, d.y - 60);
      play('bonk');
      const gone = d.g;
      at(t + 0.7, () => gone.remove());
    };

    squad.forEach((s, i) => {
      const k = res.kills[i];
      const last = s.standing ? END - 0.15 : s.fallT - 0.3;
      for (let j = 0; j < k; j++) {
        const tk = 0.95 + ((last - 0.95) * (j + rnd() * 0.6)) / k;
        victim(s, tk, i + j);
      }
    });

    // Whoever goes down is swarmed by two; a friend still standing clears them off afterwards.
    for (const s of fallen) {
      const pair = [34, 60].map((dx, j) => {
        const v = WALK * 1.05;
        const d = { x0: spawnX, v, t0: s.fallT - (spawnX - (s.x + dx)) / v - j * 0.05, stopX: s.x + dx, lane: s.lane, y: s.y, g: null, alive: true, kind: kinds[j % kinds.length], n: j };
        drowsers.push(d);
        return d;
      });
      at(s.fallT, () => {
        s.state = 'down';
        s.g.innerHTML = figureSvg(s.id, 'down');
        s.g.classList.add('fell');
        spark(s.x + 20, s.y - 70, true);
        play('down');
        if (!muted) {
          fx.shake(el, 5, 240);
          buzz(40, tuning.haptics);
        }
        const chip = el.querySelector(`.rs[data-i="${s.i}"]`);
        if (chip) chip.classList.add('is-down');
      });
      const friend = squad.find((x) => x.standing);
      pair.forEach((d, j) => {
        if (friend) at(s.fallT + 0.45 + j * 0.16, () => drop(d, s.fallT + 0.45 + j * 0.16));
        else at(s.fallT + 0.5, () => (d.stopX = -200)); // nobody left: they shuffle on
      });
    }

    // The end: everyone standing lifts a crate, one star each.
    const standing = squad.filter((s) => s.standing);
    at(END + 0.15, () => {
      for (const d of drowsers) if (d.alive && d.g && standing.length) drop(d, END + 0.15);
      for (const s of standing) setPose(s, 'cheer');
    });
    standing.forEach((s, n) => {
      at(END + 0.5 + n * 0.3, () => {
        s.state = 'carry';
        s.g.innerHTML = figureSvg(s.id, 'carry');
        s.g.classList.add('lifted');
        const st = el.querySelectorAll('.rstar')[n];
        if (st) st.classList.add('on');
        play('star', { n: n + 1 });
        const chip = el.querySelector(`.rs[data-i="${s.i}"]`);
        if (chip) chip.classList.add('is-up');
        if (!muted) buzz(12, tuning.haptics);
      });
    });
    const bannerT = END + 0.6 + Math.max(1, standing.length) * 0.3;
    at(bannerT, () => {
      const b = el.querySelector('.run-banner');
      b.innerHTML = `<b>${BANNERS[res.stars]}</b>${res.stars ? '' : `<span>Scraps: +${res.scraps} ${icon('supplies')}</span>`}`;
      b.classList.add('on', `s${res.stars}`);
      if (!res.stars) play('fail');
    });
    const total = bannerT + (res.stars ? 0.95 : 1.5);

    // --- The frame loop -----------------------------------------------------------------------
    events.sort((a, b) => a.t - b.t);
    let t = -0.25; // a breath before it starts
    let ei = 0;
    let prev = performance.now();
    let done = false;
    const skipEl = el.querySelector('.run-skip');
    const onTap = () => {
      if (!canSkip || done) return;
      speed = 40;
      muted = true;
      if (skipEl) skipEl.remove();
    };
    el.addEventListener('click', onTap);
    await new Promise((resolve) => {
      const frame = (now) => {
        const dt = Math.min(0.05, (now - prev) / 1000) * speed;
        prev = now;
        t += dt;
        while (ei < events.length && events[ei].t <= t) {
          try {
            events[ei].fn();
          } catch (err) {
            console.error(err);
          }
          ei++;
        }
        for (const d of drowsers) {
          if (!d.alive) continue;
          if (!d.g) {
            if (t < d.t0) continue;
            d.g = mk(d.lane, d.x0, d.y, `<g transform="scale(-1,1)">${drowserSvg(d.kind, d.n, 'walk')}</g>`, 'drow walking');
          }
          d.x = Math.max(d.stopX, d.x0 - d.v * (t - d.t0));
          d.g.setAttribute('transform', `translate(${d.x.toFixed(1)},${d.y})`);
          if (d.x < -90) {
            d.alive = false;
            d.g.remove();
          }
        }
        if (t >= total) return resolve();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    done = true;
    el.removeEventListener('click', onTap);
    if (skipEl) skipEl.remove();
    // Skipped: give the last picture a beat so the stars register.
    if (muted) {
      for (let n = 0; n < res.stars; n++) sfx.play('star', { n: n + 1 });
      await wait(520);
    }
    void svg;
  }

  /** Take the run off the screen. */
  close() {
    this.root.classList.remove('open');
    this.root.innerHTML = '';
  }

  /** Wait for a tap on the run (used after a run nobody came back from). */
  tap() {
    return tapOn(this.root, 150);
  }
}
