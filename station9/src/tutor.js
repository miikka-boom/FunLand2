// Mae, the tutor. She talks in short lines (typewriter, a little voice, a face that
// moves), points at the one thing to tap (the rest dims, a ring glows, a hand points),
// and runs the guided start as checkpoints, so a reload carries on where it left off.
// After the start she steps back: one-time tips when something new happens, and her
// hint bar for whenever you want to know what to do.

import { maeSvg } from './portrait.js';
import { ROLES, STARS } from './config.js';

const HAND =
  '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M14 3c2 0 3.5 1.6 3.5 3.6V18l1.5-1c1.8-.8 3.6.2 4 1.8l.2.8 1.2-.6c1.8-.7 3.6.4 3.9 2.1l.1.6 1-.3c1.9-.4 3.5 1 3.6 2.9.3 5-1 9.6-4 12.6-2.4 2.3-5.6 3.1-9 3.1-4.4 0-7.6-1.6-10-5.4L4.6 26c-1-1.6-.4-3.7 1.3-4.5 1.4-.6 3-.2 3.9 1l1 1.3V6.6C10.8 4.6 12 3 14 3z" fill="#fff" stroke="#1a1206" stroke-width="2" stroke-linejoin="round"/><path d="M17.5 18v7M23.4 19.2v5.6M28.6 21.7v4.4" stroke="#1a1206" stroke-width="1.6" stroke-linecap="round"/></svg>';

/** What Mae says about each kind of run when she points at the crew screen's banner. */
export const FAVOR_LINE = {
  night: 'It’s dark in there. Scouts see best in the dark, so they count for more.',
  horde: 'A big horde in there. Fighters shine against a horde, so they count for more.',
  toxic: 'Toxic air. Medics breathe easy in it, so they count for more.',
};

export class Tutor {
  /**
   * @param {HTMLElement} root
   * @param {object} ctx { meta(), street, hud, sound(name), voice(), isOpen(cls), open(kind), closeModal(), save(), runBusy(), adviceTarget(advice) }
   */
  constructor(root, ctx) {
    this.root = root;
    this.ctx = ctx;
    this.cur = null;
    this.ftue = false;
    this.queue = [];
    this.gen = 0; // bumped by a skip or a reset: the old guided start stops where it is
    this._build();
    this._frame = this._frame.bind(this);
    requestAnimationFrame(this._frame);
    // A line that doesn't block goes away on the next tap anywhere (and the tap still counts).
    document.addEventListener(
      'pointerdown',
      (e) => {
        const c = this.cur;
        if (c && !c.block && !this.el.box.contains(e.target)) this._finish();
      },
      true,
    );
  }

  get meta() {
    return this.ctx.meta();
  }

  /** Mae is talking, or the guided start is running. */
  get busy() {
    return !!this.cur || this.ftue;
  }

  _build() {
    this.root.innerHTML =
      `<div class="t-dim"></div><div class="t-b"></div><div class="t-b"></div><div class="t-b"></div><div class="t-b"></div><div class="t-hole"></div>` +
      `<div class="t-ring"></div><div class="t-hand">${HAND}</div>` +
      `<div class="t-box"><span class="t-face"></span><div class="t-say"><b class="t-name">MAE</b><p class="t-text"></p></div><i class="t-next"></i><button class="t-skip" type="button">Skip intro</button></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = { dim: q('.t-dim'), blocks: [...this.root.querySelectorAll('.t-b')], hole: q('.t-hole'), ring: q('.t-ring'), hand: q('.t-hand'), box: q('.t-box'), face: q('.t-face'), text: q('.t-text'), skip: q('.t-skip') };
    const tap = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._tap();
    };
    for (const el of [this.el.dim, this.el.hole, this.el.box, ...this.el.blocks]) el.addEventListener('click', tap);
    this.el.skip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
  }

  // --- Saying things ----------------------------------------------------------------------

  /**
   * Mae says one line. Resolves when you tap (or, with `wait`, as soon as that's true).
   * @param {string} text
   * @param {object} o
   *   expr     her face: smile | talk | proud | worried | wink
   *   target   () => Element to point at (the rest of the screen dims)
   *   wait     () => boolean: the line stays until this is true, and only the target can be tapped
   *   recover  () => void: called if the target goes missing while waiting (a screen got closed)
   *   block    false: nothing dims and the next tap anywhere dismisses the line
   */
  say(text, { expr = 'smile', target = null, wait = null, recover = null, block = true } = {}) {
    if (this.cur) this._finish(true);
    return new Promise((resolve) => {
      this.cur = { text, expr, target, wait, recover, block, resolve, done: false, missing: 0 };
      this.root.classList.add('on');
      this.root.classList.toggle('blocking', block);
      this.root.classList.toggle('waiting', !!wait);
      this.el.text.textContent = '';
      this.el.box.classList.remove('in', 'ready');
      void this.el.box.offsetWidth;
      this.el.box.classList.add('in');
      this._face('talk');
      clearInterval(this._typer);
      let i = 0;
      this._typer = setInterval(() => {
        const c = this.cur;
        if (!c) return clearInterval(this._typer);
        i += 1;
        this.el.text.textContent = text.slice(0, i);
        const ch = text[i - 1];
        if (i % 2 === 0 && ch !== ' ') {
          if (this.ctx.voice()) this.ctx.sound('blip');
          this._face(i % 4 === 0 ? 'talk' : 'smile');
        }
        if (i >= text.length) this._typed();
      }, 24);
    });
  }

  _typed() {
    clearInterval(this._typer);
    const c = this.cur;
    if (!c || c.done) return;
    c.done = true;
    this.el.text.textContent = c.text;
    this._face(c.expr);
    this.el.box.classList.toggle('ready', !c.wait);
  }

  _tap() {
    const c = this.cur;
    if (!c) return;
    if (!c.done) return this._typed();
    if (c.wait) {
      // Waiting for the highlighted thing: nudge the hand towards it.
      this.el.hand.classList.remove('nudge');
      void this.el.hand.offsetWidth;
      this.el.hand.classList.add('nudge');
      return;
    }
    this._finish();
  }

  _finish(replaced = false) {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    clearInterval(this._typer);
    if (!replaced) this.root.classList.remove('on', 'blocking', 'waiting', 'lit');
    this._expr = null;
    this.ctx.hud.maeFace('smile');
    c.resolve();
    if (!replaced) setTimeout(() => this._pump(), 300);
  }

  _face(expr) {
    if (this._expr === expr) return;
    this._expr = expr;
    this.el.face.innerHTML = maeSvg(expr);
    this.ctx.hud.maeFace(expr === 'talk' ? 'smile' : expr);
  }

  /** Stop everything (a reset or a skip): the guided start and any queued tips. */
  abort() {
    this.gen++;
    this.ftue = false;
    this.queue = [];
    this._pumping = false;
    this.cur = null; // left unresolved on purpose: whatever was waiting on it stops there
    clearInterval(this._typer);
    this.root.classList.remove('on', 'blocking', 'waiting', 'lit', 'ftue');
  }

  /** Each frame: keep the spotlight on its target, and check what we're waiting for. */
  _frame() {
    requestAnimationFrame(this._frame);
    const c = this.cur;
    if (!c) return;
    let r = null;
    const el = c.target ? c.target() : null;
    if (el && el.isConnected) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0 && b.bottom > 0 && b.right > 0 && b.top < innerHeight && b.left < innerWidth) {
        const pad = 6;
        r = { x: Math.max(0, b.left - pad), y: Math.max(0, b.top - pad), r: Math.min(innerWidth, b.right + pad), b: Math.min(innerHeight, b.bottom + pad) };
      }
    }
    this._place(r);
    if (c.wait && c.wait()) {
      this._typed();
      this._finish();
      return;
    }
    // Waiting on something that went away (its screen got closed): bring it back.
    if (c.wait && c.recover && !r) {
      c.missing += 1;
      if (c.missing === 40) c.recover();
      if (c.missing > 120) c.missing = 0;
    } else c.missing = 0;
  }

  _place(r) {
    const W = innerWidth;
    const H = innerHeight;
    const [top, bottom, left, right] = this.el.blocks;
    const put = (e, x, y, w, h) => {
      e.style.transform = `translate(${x}px, ${y}px)`;
      e.style.width = `${Math.max(0, w)}px`;
      e.style.height = `${Math.max(0, h)}px`;
    };
    this.root.classList.toggle('lit', !!r);
    if (r) {
      put(top, 0, 0, W, r.y);
      put(bottom, 0, r.b, W, H - r.b);
      put(left, 0, r.y, r.x, r.b - r.y);
      put(right, r.r, r.y, W - r.r, r.b - r.y);
      put(this.el.hole, r.x, r.y, r.r - r.x, r.b - r.y);
      put(this.el.ring, r.x, r.y, r.r - r.x, r.b - r.y);
      // The hand points at the target from below, or from above near the bottom edge.
      const cx = (r.x + r.r) / 2;
      const below = r.b + 48 < H;
      this.el.hand.classList.toggle('up', !below);
      this.el.hand.style.transform = `translate(${Math.min(W - 44, Math.max(4, cx - 8))}px, ${below ? r.b - 10 : r.y - 34}px)`;
    }
    // Mae's box goes wherever it covers the target least (the bottom, unless that's in the way).
    const bh = this.el.box.offsetHeight + 12;
    let atTop = false;
    if (r) {
      const overBottom = Math.max(0, r.b - (H - bh));
      const overTop = Math.max(0, bh - r.y);
      atTop = overBottom > 0 && overTop < overBottom;
    }
    this.el.box.classList.toggle('at-top', atTop);
  }

  // --- Tips and hints ----------------------------------------------------------------------

  waitUntil(pred) {
    return new Promise((resolve) => {
      const check = () => (pred() ? resolve() : setTimeout(check, 100));
      check();
    });
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  q(sel) {
    return () => document.querySelector(sel);
  }

  /** Something Mae says now and then (not once only): queued like a tip. */
  note(lines, o = {}) {
    this.queue.push({ lines, o });
    this._pump();
  }

  /**
   * A one-time tip: queued, shown when nothing else is going on.
   * Lines are strings or { text, expr, target }. o: { expr, target, when(), before() }
   */
  tip(id, lines, o = {}) {
    const s = this.meta.s;
    if (!s.tut.done || s.tut.seen[id]) return false;
    s.tut.seen[id] = true;
    this.queue.push({ lines: Array.isArray(lines) ? lines : [lines], o });
    this._pump();
    return true;
  }

  async _pump() {
    if (this.cur || this.ftue || !this.queue.length || this._pumping) return;
    const next = this.queue[0];
    if (this.ctx.runBusy() || (next.o.when && !next.o.when())) {
      clearTimeout(this._pumpT);
      this._pumpT = setTimeout(() => this._pump(), 400);
      return;
    }
    this._pumping = true;
    this.queue.shift();
    if (next.o.before) next.o.before();
    for (const line of next.lines) {
      const l = typeof line === 'string' ? { text: line } : line;
      await this.say(l.text, { expr: l.expr || next.o.expr || 'smile', target: l.target || next.o.target || null });
    }
    this._pumping = false;
    this.ctx.save();
    setTimeout(() => this._pump(), 300);
  }

  /** Tap Mae (on the street or her hint bar): she points at the best next step. */
  ask() {
    if (this.ftue || this._pumping) return;
    const a = this.meta.advice();
    const target = this.ctx.adviceTarget(a);
    this.say(a.text, { expr: a.kind === 'build' ? 'wink' : a.kind === 'play' ? 'proud' : 'talk', target, block: false });
  }

  // --- The guided start --------------------------------------------------------------------

  /** Run (or resume) the guided start. Each checkpoint knows whether it's already done. */
  async start() {
    const s = () => this.meta.s;
    if (s().tut.done || this.ftue) return;
    const gen = ++this.gen;
    this.ftue = true;
    this.root.classList.add('ftue');
    // Resuming after a reload: whatever Mae already showed stays shown.
    if (s().you !== null) this.show('beds', false);
    if (s().story >= 1) for (const k of ['play', 'scrap']) this.show(k, false);
    for (const step of this._steps(gen)) {
      // A step that didn't get done (a forced loss in testing) simply runs again.
      while (gen === this.gen && !step.done(s())) {
        await step.run();
        this.ctx.save();
      }
      if (gen !== this.gen) return; // skipped or reset
    }
    if (!s().tut.done) this._wrapUp();
  }

  /** Testers (and the impatient) can skip: everything Mae would have set up is set up. */
  skip() {
    if (!this.ftue) return;
    this.abort();
    const m = this.meta;
    if (m.s.you === null) m.chooseYou(0);
    this.ctx.closeModal();
    this._wrapUp();
  }

  _wrapUp() {
    const m = this.meta;
    this.ftue = false;
    this.root.classList.remove('ftue');
    m.openGate();
    m.startConvoy();
    for (const k of ['beds', 'scrap', 'play', 'gate', 'hint']) this.show(k, false);
    m.s.tut.done = true;
    m.changed();
    this.ctx.save();
  }

  /** Reveal a HUD piece and remember it. */
  show(key, sound = true) {
    const seen = this.meta.s.tut.seen;
    if (seen[`hud:${key}`]) return;
    seen[`hud:${key}`] = true;
    this.ctx.hud.reveal(key);
    if (sound) this.ctx.sound('pop');
  }

  _steps(gen) {
    const m = () => this.meta;
    const { street } = this.ctx;
    const isOpen = this.ctx.isOpen;
    const open = this.ctx.open;
    // Once skipped or reset, every await below simply never comes back.
    const live = () => gen === this.gen;
    const halt = () => new Promise(() => {});
    const say = (text, o) => (live() ? this.say(text, o) : halt());
    const sleep = (ms) => this.sleep(ms).then(() => (live() ? undefined : halt()));
    const until = (pred) =>
      new Promise((resolve) => {
        const check = () => {
          if (!live()) return;
          if (pred()) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    const missing = () => {
      const have = new Set([...m().s.people, ...m().s.gate.visitors].map((p) => p.role));
      return Object.keys(ROLES).filter((r) => !have.has(r));
    };
    const knock = (stars) => {
      const v = m().arrive({ role: missing()[0] || 'fighter', stars, level: 1 });
      street.bark(true);
      this.ctx.sound('knock');
      setTimeout(() => this.ctx.sound('bark'), 500);
      return v;
    };
    return [
      {
        // Hello, and who are you?
        done: (s) => s.you !== null,
        run: async () => {
          street.focusHome(true);
          await sleep(600);
          await say('Easy there. You’re safe now. This is Station 9.', { expr: 'smile', target: () => street.mae.el });
          await say('I’m Mae. Fire captain here for thirty years. Still am, I suppose.', { expr: 'wink', target: () => street.mae.el });
          street.bark();
          this.ctx.sound('bark');
          await say('That’s Biscuit. He decides who’s trouble.', { expr: 'proud', target: () => street.dog.el });
          await say('Nobody stays here without a name. So, who are you?', { expr: 'talk' });
          if (!isOpen('m-pick')) open('pick');
          await say('Tap the one that’s you.', { target: this.q('#modals .ycs'), wait: () => !!document.querySelector('#modals .yc.on') || m().s.you !== null, recover: () => open('pick') });
          await say('Good. Now tap “That’s me”.', { target: this.q('#modals [data-act="iAm"]'), wait: () => m().s.you !== null, recover: () => open('pick') });
          await until(() => !isOpen('m-pick'));
          this.show('beds');
          await sleep(500);
          const you = m().you();
          await say(`${you.first}. Good name. Biscuit likes you already.`, { expr: 'proud', target: () => (street.people.get(you.id) || {}).el });
        },
      },
      {
        // The first stranger at the gate.
        done: (s) => s.people.length >= 2,
        run: async () => {
          if (!m().s.gate.visitors.length) knock(1);
          street.focusGate();
          await sleep(1400);
          await say('Hear that? Someone’s at the gate. Tap them.', { expr: 'worried', target: () => street.visitorEl(), wait: () => isOpen('m-visitor') });
          const v = m().s.gate.visitors[0];
          await say(`Everyone who turns up is different. ${v.first} is a ${ROLES[v.role].name}. ${ROLES[v.role].blurb}`, { target: this.q('#modals .v-role') });
          await say(`Stars show how good someone can get. ${v.stars === 1 ? 'One is fine. Everyone starts somewhere.' : 'Not bad at all.'}`, { target: this.q('#modals .v-stars') });
          await say('We have a bed. Take them in.', { target: this.q('#modals [data-act="take"]'), wait: () => m().s.people.length >= 2, recover: () => open('visitor') });
          await sleep(1500);
          await say(`Welcome, ${v.first}. See the beds up there? Two taken, one free.`, { expr: 'smile', target: this.q('#hud .ppl') });
        },
      },
      {
        // The first run.
        done: (s) => s.story >= 1,
        run: async () => {
          street.focusBuilding('diner');
          await sleep(700);
          await say('That’s Rosie’s Diner. Full of them, and full of food. Let’s take it back.', { expr: 'talk', target: () => street.buildingEl('diner') });
          this.show('play');
          await say('Tap PLAY.', { target: this.q('#hud .play'), wait: () => isOpen('m-crew') });
          await say('You always go. Pick up to three people to go with you.', { target: this.q('#modals .slots') });
          await say(FAVOR_LINE[m().nextRun().tag], { target: this.q('#modals .favor') });
          await say('I put the best crew together. Tap GO!', { expr: 'proud', target: this.q('#modals [data-act="start"]'), wait: () => this.ctx.runBusy(), recover: () => open('crew') });
          await until(() => isOpen('m-results'));
          await sleep(1300);
          if (m().s.story < 1) {
            await say('We lost that one. It happens. Let’s go again.', { expr: 'worried' });
          } else {
            await say('You made it! Everyone who went gets XP. Fill the bar and they level up.', { expr: 'proud', target: this.q('#modals .res-r') });
            this.show('scrap');
            await say('And scrap. We build with scrap.', { target: this.q('#modals .r-total') });
          }
          await say('Tap Continue.', { target: this.q('#modals .res .btns .btn'), wait: () => !isOpen('m-results') });
          await sleep(900);
        },
      },
      {
        // A second stranger, a full house, the first upgrade.
        done: (s) => s.buildings.firehouse >= 2,
        run: async () => {
          if (m().s.people.length < 3) {
            if (!m().s.gate.visitors.length) knock(2);
            street.focusGate();
            await sleep(1400);
            await say('Another one! Go and see.', { expr: 'worried', target: () => street.visitorEl(), wait: () => isOpen('m-visitor') });
            const v = m().s.gate.visitors[0];
            await say(`${v.stars} stars: ${STARS[v.stars].name}. ${v.first} could get really good.`, { expr: 'proud', target: this.q('#modals .v-stars') });
            await say('Take them in.', { target: this.q('#modals [data-act="take"]'), wait: () => m().s.people.length >= 3, recover: () => open('visitor') });
            await sleep(1500);
          }
          await say('Three people, three beds. We’re full.', { expr: 'worried', target: this.q('#hud .ppl') });
          const cost = m().upgradeCost('firehouse');
          if (cost !== null && m().s.scrap < cost) m().give(cost - m().s.scrap); // the guided start never gets stuck
          street.focusBuilding('firehouse');
          await sleep(700);
          await say('Let’s make room. Tap the firehouse.', { target: () => street.buildingEl('firehouse'), wait: () => isOpen('m-build') });
          await say('Upgrades are instant. Pay the scrap and it’s done.', { target: this.q('#modals [data-act="up"]'), wait: () => m().s.buildings.firehouse >= 2, recover: () => open('firehouse') });
          await sleep(900);
          this.ctx.closeModal();
          await sleep(500);
          await say('Five beds. Now that’s a home.', { expr: 'proud', target: this.q('#hud .ppl') });
        },
      },
      {
        // Take the diner back.
        done: (s) => s.story >= 2,
        run: async () => {
          street.focusBuilding('diner');
          await sleep(600);
          await say('Now let’s finish the diner. Tap PLAY.', { expr: 'talk', target: this.q('#hud .play'), wait: () => isOpen('m-crew') });
          await say(FAVOR_LINE[m().nextRun().tag], { target: this.q('#modals .favor') });
          await say('Ready? GO!', { expr: 'proud', target: this.q('#modals [data-act="start"]'), wait: () => this.ctx.runBusy(), recover: () => open('crew') });
          await until(() => isOpen('m-results'));
          await until(() => !isOpen('m-results'));
          if (m().s.story < 2) return;
          await until(() => isOpen('m-reveal'));
          await until(() => !isOpen('m-reveal'));
          await sleep(600);
        },
      },
      {
        // That's the job.
        done: (s) => s.tut.done,
        run: async () => {
          street.focusHome(true);
          m().openGate();
          m().startConvoy();
          await sleep(500);
          await say('That’s the job. Take people in, pick your crew, take the street back.', { expr: 'talk' });
          this.show('gate');
          await say('More people will find us now. Keep an eye on the gate.', { target: this.q('#hud .gatew') });
          this.show('hint');
          await say('And I’m right here. Not sure what’s next? Tap me.', { expr: 'wink', target: this.q('#hud .maeb') });
          this._wrapUp();
        },
      },
    ];
  }
}
