// The tutorial at run time (the map is world/tutorial-gen.js, the coaching on
// screen render/tutorial-render.js). One lesson after another, each with:
//   - at most one short line of words, at the top of the screen (worded for
//     whatever you play with: touch, mouse, pad), and often none at all,
//   - the gesture to show (a ghost thumb on the half of the screen it uses)
//     and where to go (a ring, a bouncing arrow over the spot, an edge arrow),
//   - for a button you have to press, a prompt: the world slows to a stop,
//     the screen goes dark but for that button (and you), a thumb shows the
//     tap, and nothing but that button works until you press it,
//   - the zombies it needs, spawned on cue and counted until they're down,
//     and the gate it opens when you're done.
// One gun all the way through (the final game has no weapon changing, so the
// tutorial doesn't teach it: the gun panel stays shut), and it always works:
// nothing here empties it behind your back. No Witch either: she is too much
// for a first run. Nobody dies in the tutorial: at 0 HP you get a second wind.
// It's short on purpose: eight lessons on three short streets, a couple of
// minutes for a first-timer. Everything the player reads is in STEPS, at the
// top, for editing.
//
// Tutorial 2 (Day 2: supplies, a boarded room, the secret) runs on the same
// runner with its own lessons (tutorial-day2.js) and map (map.tutorial.day).

import { startFlee } from './witch.js';
import { releasePin } from './specials.js';
import { SHOVE_REACH } from './player.js';
import { DAY2_STEPS, LOST } from './tutorial-day2.js';
import { DEG, wrapAngle, clamp, pointInRect } from '../util.js';

/** Done on this device, per day (Day 1's key is the one it always had). */
const KEYS = { 1: 'funland2.p0.tutorial.v1', 2: 'funland2.p0.tutorial2.v1' };
const GATE_OPEN = 1.1; // s for the bars to slide back into the wall
const PAUSE = 0.6; // s between a lesson done (✓) and the next one
const AIM_HOLD = 0.45; // s of laser on a target that counts as "aimed"
const RESCUE_HP = 0.55; // of max HP: the second wind
const RESCUE_PUSH = 180; // u: what's that close gets thrown back
const REVEAL = 0.5; // s for a part of the HUD to fade in when its time comes
const NUDGE_SHOW = 4; // s a nudge has the line
const NUDGE_AGAIN = 8; // s before the same nudge can come back
export const PROMPT_IN = 0.25; // s for the world to stop and the screen to go dark round the button
export const PROMPT_OUT = 0.3; // s for both to come back once it's pressed
const SLOW_FROM = 170; // u: one coming at you this close slows the world (the shove prompt), to a stop in reach
const BURST = 250; // u: how close you come by the door before the one in it bursts out (Day 1's shove)
const NONE = [];

/**
 * What the player has been doing in this lesson, for the nudges (reset as
 * each lesson starts): thumbs down and for how long, taps that went nowhere,
 * aiming that never fired, shoves that missed, standing still, not firing,
 * the second winds so far, and how long since they last got any closer to
 * where the lesson points.
 */
function freshWatch() {
  return { leftDown: 0, leftSlid: false, leftTaps: 0, leftStill: 0, rightDown: 0, rightDrag: 0, noRight: 0, aimNoFire: 0, taps: 0, missed: 0, lastHits: 0, noFire: 0, still: 0, rescues: 0, best: Infinity, noProgress: 0 };
}

/**
 * The HUD, a part at a time (Day 1): a step's `hud` brings in that part and
 * the ones before it. 'sticks' is the two sticks alone (and the tutorial's own
 * line, arrows and rings); then ⟳; then the SHOVE button; then all of it
 * (health, ammo, the pause button, the threat arrows). A course whose steps
 * never say shows it all from the start.
 */
export const HUD_PARTS = ['sticks', 'reload', 'shove', 'all'];

const left = (list) => list.reduce((n, z) => n + (z.alive ? 1 : 0), 0);
const near = (p, q, r) => Math.hypot(p.x - q.x, p.y - q.y) < r;
const ease = (f) => f * f * (3 - 2 * f);

/** The shove prompt's words, and what follows it. */
const SHOVE_NOW = { touch: 'Too close! Tap SHOVE.', mouse: 'Too close! Press Space.', pad: 'Too close! Press RB.' };
const SHOOT_IT = { touch: 'Now shoot it.', mouse: 'Now shoot it.', pad: 'Now shoot it.' };

/**
 * The lessons. text: the one line at the top, per input (pad falls back to
 * mouse, mouse to touch); null for none, or a function (Tutorial, Game) that
 * picks one as the lesson goes. nudges: what someone doing it wrong is told
 * instead, each { id, when(t, g), text } (`t.watch` says what they've been
 * doing; see freshWatch): the line becomes the nudge's, in amber, for a few
 * seconds, and the playtest report counts them: that's where people get stuck.
 * coach: the gesture drawn for touch ('move' | 'aim' | 'fire' | 'kite': both
 * thumbs at once), or a function that picks one; a prompt (Tutorial.ask) takes
 * its place while it's up. dot: it is one of the lessons counted in the
 * report. The functions get the Tutorial and the Game.
 */
export const STEPS = [
  {
    // Before anything, on a phone or tablet: a screen of its own, black, with
    // a big picture of how to hold it (on its side, a hand at each end, the
    // thumbs on the sticks) and one line, until you tap anywhere; then it
    // fades into the game (render/tutorial-render.js: drawTutorialIntro).
    // Not a lesson of its own, and with a mouse or a pad it never shows.
    id: 'hold',
    title: 'HOLD YOUR PHONE LIKE THIS',
    intro: true,
    hud: 'sticks', // after this, the two sticks and nothing else
    text: { touch: 'Both hands, a thumb on each side.' },
    skip: (t, g) => !!g.input && g.input.source !== 'touch',
    nudges: [{ id: 'no-tap', when: (t) => t.t > 6, stays: true, text: { touch: 'Tap the screen to start.' } }],
    update: (t, g) => {
      const f = g.input;
      if (!f) return false;
      return !!((f.thumbs && (f.thumbs.left || f.thumbs.right)) || (f.events && f.events.length));
    },
  },
  {
    id: 'move',
    dot: true,
    title: 'MOVE',
    coach: 'move',
    text: {
      touch: 'Left thumb: walk to the ring.',
      mouse: 'W A S D: walk to the ring.',
      pad: 'Left stick: walk to the ring.',
    },
    nudges: [
      { id: 'tapped', when: (t) => t.watch.leftTaps >= 2, text: { touch: 'Keep your thumb down and slide it.' } },
      { id: 'still-thumb', when: (t) => t.watch.leftStill > 1.2, text: { touch: 'Now slide it toward the ring.' } },
      { id: 'right-thumb', when: (t) => t.watch.rightDrag > 1.5, text: { touch: 'Walk with your LEFT thumb.' } },
    ],
    target: (t) => ({ ...t.L.moveRing, ring: true }),
    update: (t, g) => near(g.player, t.L.moveRing, t.L.moveRing.r),
  },
  {
    id: 'aim',
    dot: true,
    title: 'AIM',
    coach: 'aim',
    text: {
      touch: 'Right thumb: aim at one.',
      mouse: 'Point the mouse at one.',
      pad: 'Right stick: aim at one.',
    },
    nudges: [
      { id: 'tapped', when: (t) => t.watch.taps >= 2, text: { touch: "Don't tap: keep your right thumb down." } },
      { id: 'no-right', when: (t, g) => t.watch.noRight > 5 && g.input.source === 'touch', text: { touch: 'Use your RIGHT thumb now.' } },
    ],
    target: (t) => t.penTarget(),
    enter: (t) => {
      t.aimT = 0;
    },
    update: (t, g, dt) => {
      if (t.penHurt()) return true; // already shooting them: on to that
      if (t.aimedAt()) t.aimT += dt;
      return t.aimT >= AIM_HOLD;
    },
  },
  {
    id: 'fire',
    dot: true,
    title: 'FIRE',
    coach: 'fire',
    text: {
      touch: 'Push past the ring to shoot.',
      mouse: 'Click to shoot.',
      pad: 'Push the stick all the way to shoot.',
    },
    nudges: [
      { id: 'no-push', when: (t) => t.watch.aimNoFire > 2.5, text: { touch: 'Push your thumb further, past the ring.', mouse: 'Click to shoot.', pad: 'Push the stick all the way, or pull RT.' } },
      { id: 'tapped', when: (t) => t.watch.taps >= 2, text: { touch: 'A tap shoves. Push past the ring.' } },
    ],
    target: (t) => t.penTarget(),
    count: (t) => `${t.pen.length - left(t.pen)}/${t.pen.length}`,
    update: (t) => left(t.pen) === 0,
  },
  {
    // Straight after the shooting, nothing about: the world stops, the screen
    // goes dark but for the ⟳ button coming in, a thumb taps it, and only it
    // works. (The gun reloads itself when it clicks empty too; this is the
    // button for topping up between fights.)
    id: 'reload',
    dot: true,
    title: 'RELOAD',
    hud: 'reload', // ⟳ comes in
    text: { touch: 'Tap to reload.', mouse: 'Press R to reload.', pad: 'Press X to reload.' },
    nudges: [{ id: 'no-reload', when: (t) => t.t > 5, text: { touch: 'Tap the round ⟳ button.', mouse: 'Press R.', pad: 'Press X.' } }],
    enter: (t, g) => {
      // Something to reload (it's out of sight: the ammo count comes in later).
      const w = g.player.weapon;
      w.reloading = false;
      w.mag = Math.min(w.mag, w.cap - 14);
      t.ask('reload');
    },
    update: (t, g) => g.player.weapon.reloading,
    done: (t) => t.openGate('g1'),
  },
  {
    id: 'gate1',
    title: "GATE'S OPEN",
    text: null, // the gate's lights go green and the arrow bounces over it: no words needed
    nudges: [LOST],
    target: (t) => t.gateTarget('g1'),
    update: (t, g) => g.player.y < t.L.gates.g1.y - 40,
  },
  {
    // The gun still works. As you come by the door, one bursts out of it at
    // you; the world slows as it closes in and stops when it's in reach, the
    // screen goes dark but for you, it and the SHOVE button (coming in just
    // then), and only a shove gets you going again. Then you shoot it.
    id: 'shove',
    dot: true,
    title: 'SHOVE',
    text: (t) => (!t || !t.lunger ? null : t.shoved ? SHOOT_IT : SHOVE_NOW),
    coach: (t) => (t.shoved && t.lunger && t.lunger.alive ? 'fire' : null),
    nudges: [
      { ...LOST, when: (t) => !t.lunger && LOST.when(t) },
      { id: 'no-shove', when: (t) => !t.shoved && !!t.prompt && t.scale === 0 && t.prompt.t > 4.5, text: { touch: 'Tap the SHOVE button.', mouse: 'Press Space.', pad: 'Press RB.' } },
      { id: 'not-shooting', when: (t) => t.shoved && t.watch.noFire > 4, text: { touch: 'Push past the ring to shoot.', mouse: 'Click to shoot.', pad: 'Pull RT to shoot.' } },
    ],
    enter: (t, g) => {
      t.lunger = null;
      t.shoved = false;
      t.group = [];
      t.base.hits = g.stats.shoveHits;
    },
    // Along the street to the door (after that, it comes to you).
    target: (t) => (t.lunger ? null : { ...t.L.shoveWalk }),
    update: (t, g) => {
      const p = g.player;
      if (!t.lunger) {
        const D = t.L.shoveSpawn;
        if (Math.hypot(p.x - D.x, p.y - D.y) > BURST && p.x > D.x + 100) return false;
        const z = g.director.spawnAt(D.x, D.y, true);
        if (!z) return false;
        z.speed *= 1.2; // bursting out
        t.lunger = z;
        t.lungerHp = z.hp;
        t.group = [z];
        g.audio.snarl(z.x, z.y);
        return false;
      }
      const z = t.lunger;
      if (!t.shoved) {
        z.hp = Math.max(z.hp, t.lungerHp); // a shove first: until then, bullets don't put this one down
        if (!t.prompt && z.alive && Math.hypot(z.x - p.x, z.y - p.y) < SLOW_FROM) {
          t.revealUpTo('shove'); // SHOVE comes in, in the light
          t.ask('shove', { threat: z });
        }
        if (g.stats.shoveHits > t.base.hits) {
          t.shoved = true;
          t.watch.noFire = 0; // (from now on it's about shooting it)
          t.answer();
        }
        return false;
      }
      return !z.alive;
    },
  },
  {
    id: 'kite',
    dot: true,
    title: 'BOTH THUMBS',
    hud: 'all', // and from here on, all of it
    coach: 'kite',
    text: { touch: 'Back off and shoot.', mouse: 'Back off and shoot.', pad: 'Back off and shoot.' },
    nudges: [
      { id: 'not-shooting', when: (t) => t.watch.noFire > 3.5 && t.close(t.group, 450), text: { touch: 'Right thumb: keep shooting!', mouse: 'Keep shooting!', pad: 'Keep shooting!' } },
      { id: 'not-backing', when: (t) => t.watch.still > 1.2 && t.close(t.group, 110), text: { touch: 'Left thumb: back off!', mouse: 'Back off (W A S D)!', pad: 'Back off!' } },
    ],
    enter: (t, g) => {
      // Down the street at you, so you see them coming (map.tutorial.packSpawns).
      const from = t.unseen(t.L.packSpawns);
      t.group = [];
      t.spawn(from, 5, 1.4, t.group);
      g.audio.horde(from[0].x, from[0].y);
    },
    count: (t) => `${t.group.length - left(t.group)}/5`,
    update: (t) => t.spawned(t.group) && t.cleared(t.group),
    done: (t) => t.openGate('g2'),
  },
  {
    id: 'gate2',
    title: "GATE'S OPEN",
    text: null,
    nudges: [LOST],
    target: (t) => t.gateTarget('g2', 170), // out into the street, where this one's done
    // Done once you're out on row 3, where the car is in plain view.
    update: (t, g) => g.player.y < t.L.gates.g2.y - 130,
  },
  {
    id: 'alarm',
    dot: true,
    title: "DON'T SHOOT THE CAR",
    text: { touch: "Don't shoot the car." },
    enter: (t) => {
      t.group = [];
      t.spawn(t.L.alarmSpawns, 4, 1.2, t.group);
    },
    count: (t) => `${t.group.length - left(t.group)}/4`,
    update: (t, g) => t.spawned(t.group) && t.cleared(t.group) && !g.director.alarm,
    done: (t) => t.openGate('g3'),
  },
  {
    id: 'saferoom',
    dot: true,
    title: 'RUN FOR IT',
    text: { touch: 'Run to the safe room!' },
    nudges: [{ id: 'fighting', when: (t) => t.watch.noProgress > 5, text: { touch: "Don't fight: run for it!" } }],
    enter: (t, g) => {
      // A crowd up through the last gate, behind you: no need to fight it.
      const from = t.unseen(t.L.rushSpawns);
      t.group = [];
      t.spawn(from, 8, 2.4, t.group);
      g.audio.horde(from[0].x, from[0].y);
      g.stats.hordes++;
      g.announce('HERE THEY COME!', '#ff6b5a', 2.2);
    },
    target: (t, g) => {
      const er = g.world.map.endRoom.interior;
      return { x: er.x + er.w / 2, y: er.y + er.h / 2, label: 'SAFE' };
    },
    update: (t, g) => g.won,
  },
];

/** The lessons that count (in the report: how far you got). */
export const LESSONS = STEPS.filter((s) => s.dot).length;

/** Each day's lessons, by map.tutorial.day. */
export const COURSES = { 1: STEPS, 2: DAY2_STEPS };

/** The tutorial level ids, in order (each one, won, leads to the next; after the last, the Streets). */
export const TUTORIAL_LEVELS = ['tutorial', 'tutorial2'];

/** A step's (or a nudge's) line for an input source: touch | mouse | gamepad; null for none. */
export function stepText(step, source, t = null, g = null) {
  const T = typeof step.text === 'function' ? step.text(t, g) : step.text;
  if (!T) return null;
  if (source === 'gamepad') return T.pad || T.mouse || T.touch;
  if (source === 'mouse') return T.mouse || T.touch;
  return T.touch;
}

export class Tutorial {
  constructor(game) {
    this.game = game;
    this.L = game.world.map.tutorial;
    this.day = this.L.day || 1;
    this.steps = COURSES[this.day] || STEPS;
    this.of = this.steps.filter((s) => s.dot).length;
    this.i = -1;
    this.t = 0; // seconds in this lesson (real ones: they run on while the world waits)
    this.clock = 0; // seconds since it began, real ones (the coaching's animation)
    this.pause = 0; // seconds left of the ✓ before the next one
    this.over = false;
    this.queue = []; // zombies still to come: { x, y, t, list }
    this.group = []; // the current lesson's zombies
    this.extra = []; // whatever an alarm brought (they have to go too)
    this.base = { hits: 0 };
    this.aimT = 0;
    this.aimed = null;
    this.lunger = null; // Day 1's shove: the one out of the door
    this.shoved = false;
    this.rescues = 0;
    this.alarmed = false;
    this.finished = false; // reached the safe room (remembered on the device)
    this.times = {};
    // A button to press (ask): the world slows to a stop while it's up, and only that button works.
    this.prompt = null;
    this.scale = 1; // how fast the world runs (1: as ever; 0: stopped)
    game.locks = { swap: true }; // one gun, all the way through
    // The HUD: when each part came in (the tutorial's clock); none yet if the course says when.
    this.revealT = {};
    if (!this.steps.some((s) => s.hud)) for (const k of HUD_PARTS.slice(1)) this.revealT[k] = -Infinity;
    // The gates, shut.
    this.gates = {};
    for (const [id, G] of Object.entries(this.L.gates)) this.gates[id] = { ...G, state: 'shut', f: 0 };
    // Day 1: six of them in the pen, waiting for the lesson that needs them.
    this.pen = (this.L.penZombies || []).map((q) => game.director.spawnAt(q.x, q.y, false)).filter(Boolean);
    for (const z of this.pen) z.penned = true;
    // Day 2: whoever is nailed in with the good stuff (spawned with the map's boarded room).
    this.sleepers = this.L.room ? game.zombies.filter((z) => z.alive && pointInRect(z.x, z.y, this.L.room, 4)) : [];
    this.need = 0;
    // The nudges: what you've been doing this lesson, the one on the line now, when each last came, how many there were.
    this.watch = freshWatch();
    this.nudge = null;
    this.nudgedAt = {};
    this.nudges = {};
    this.next();
  }

  get step() {
    return this.steps[Math.max(0, Math.min(this.i, this.steps.length - 1))];
  }

  /** How many of the counted lessons are behind you. */
  get lessonsDone() {
    let n = 0;
    for (let k = 0; k < this.steps.length; k++) if (this.steps[k].dot && (k < this.i || (k === this.i && this.pause > 0) || this.over)) n++;
    return n;
  }

  /** On to the next lesson (skipping any that don't apply on this run). */
  next() {
    const g = this.game;
    for (;;) {
      this.i++;
      if (this.i >= this.steps.length) {
        this.over = true;
        this.i = this.steps.length - 1;
        return;
      }
      const s = this.steps[this.i];
      if (s.hud) this.revealUpTo(s.hud); // (a step that's skipped still brings its part of the HUD)
      if (s.skip && s.skip(this, g)) continue;
      this.t = 0;
      this.watch = freshWatch();
      this.watch.lastHits = g.stats.shoveHits;
      this.watch.rescues = this.rescues;
      this.nudge = null;
      if (s.enter) s.enter(this, g);
      return;
    }
  }

  complete() {
    const g = this.game;
    const s = this.step;
    this.times[s.id] = +this.t.toFixed(1);
    this.answer(); // whatever it was waiting on, it's done
    if (s.done) s.done(this, g);
    this.pause = PAUSE;
    if (s.dot) g.audio.pickup();
  }

  /**
   * dt: the world's seconds (slowed or stopped while a prompt is up); real: the
   * player's. The lessons' timers, the nudges, the ✓ and the prompts run on
   * real seconds; the zombies on cue and the gates on the world's.
   */
  update(dt, real = dt) {
    const g = this.game;
    this.clock += real;
    this.updateQueue(dt);
    this.updateGates(dt);
    this.watchWitch(dt);
    if (g.won && !this.finished) {
      this.finished = true;
      saveTutorialDone(g.stats.time, this.day);
    }
    this.updatePrompt(real);
    if (this.over) return;
    if (this.pause > 0) {
      this.pause -= real;
      if (this.pause <= 0) {
        this.pause = 0;
        this.next();
      }
      return;
    }
    const s = this.step;
    // A step for one kind of input only (the holding picture is for touch) goes as soon as it's clear it's not you.
    if (s.skip && s.skip(this, g)) {
      this.next();
      return;
    }
    this.t += real;
    this.watchInput(real);
    if (s.update(this, g, dt)) {
      this.complete();
      return;
    }
    this.checkNudges(s, real);
  }

  // --- A button to press ------------------------------------------------------------------------

  /**
   * Ask for a button ('reload' | 'shove'): the screen goes dark but for it (and
   * you, and `threat` if there's one on you) and a thumb taps it. stop: the
   * world slows to a stop while it's up (with a threat, as that closes in:
   * stopped once it's in reach) and only that button works; without, it's a
   * pointer and nothing more.
   */
  ask(kind, { stop = true, threat = null } = {}) {
    this.prompt = { kind, stop, threat, t: 0, out: 0, answered: false, held: false, beat: 0 };
  }

  /** It's been pressed (or isn't needed any more): the dark lifts and the world speeds up again. */
  answer() {
    if (this.prompt && !this.prompt.answered) this.prompt.answered = true;
  }

  /** How fast the world runs this frame: 1 as ever, less while a prompt slows it, 0 stopped. */
  timeScale() {
    return this.scale;
  }

  /** Is this one close enough for a shove to land? */
  inReach(z) {
    const p = this.game.player;
    return Math.hypot(z.x - p.x, z.y - p.y) - z.r <= SHOVE_REACH - 6;
  }

  /** How fast a prompt wants the world: stopped, or slowing as its threat closes in. */
  wantScale(P) {
    if (!P.stop) return 1;
    const z = P.threat;
    if (!z || !z.alive || this.inReach(z)) return 0;
    const p = this.game.player;
    const d = Math.hypot(z.x - p.x, z.y - p.y) - z.r;
    return clamp((d - SHOVE_REACH) / (SLOW_FROM - SHOVE_REACH), 0.12, 1);
  }

  updatePrompt(real) {
    const P = this.prompt;
    let want = 1;
    if (P) {
      P.t += real;
      if (P.answered) {
        P.out += real;
        if (P.out >= PROMPT_OUT) this.prompt = null;
      } else want = this.wantScale(P);
    }
    // Down quickly, back up a little slower.
    if (want < this.scale) this.scale = Math.max(want, this.scale - real / PROMPT_IN);
    else this.scale = Math.min(want, this.scale + real / PROMPT_OUT);
    // While the world waits with one on you: a heartbeat.
    if (P && !P.answered && P.threat && this.scale === 0) {
      P.beat -= real;
      if (P.beat <= 0) {
        P.beat = 1.1;
        this.game.audio.heartbeat(0.5);
      }
    }
  }

  /**
   * What gets through of this frame's taps and presses. While a prompt holds
   * the world, only its own button: a shove pressed before the one coming at
   * you is in reach waits for it (it goes the moment it can land).
   */
  events(list) {
    const P = this.prompt;
    if (!P || P.answered || !P.stop) return list;
    const ready = !P.threat || !P.threat.alive || this.inReach(P.threat);
    let go = false;
    for (const e of list) {
      if (e !== P.kind) continue;
      if (ready) go = true;
      else P.held = true;
    }
    if (ready && P.held) {
      P.held = false;
      go = true;
    }
    return go ? [P.kind] : NONE;
  }

  // --- Doing it wrong ------------------------------------------------------------------------

  /** Keep up with what the player is doing (see freshWatch). */
  watchInput(dt) {
    const g = this.game;
    const f = g.input;
    if (!f) return;
    const W = this.watch;
    const th = f.thumbs || {};
    const p = g.player;
    const pushed = Math.hypot(f.move.x, f.move.y);
    // The left thumb: short touches that went nowhere (a tap where a slide was wanted), or down and still.
    if (th.left) {
      W.leftDown += dt;
      if (pushed > 0.25) W.leftSlid = true;
    } else if (W.leftDown > 0) {
      if (W.leftDown < 0.35 && !W.leftSlid) W.leftTaps++;
      W.leftDown = 0;
      W.leftSlid = false;
    }
    W.leftStill = th.left && pushed < 0.15 ? W.leftStill + dt : 0;
    // The right thumb: held, dragged on its own (walking with it?), not there at all.
    W.rightDown = th.right ? W.rightDown + dt : 0;
    W.rightDrag = th.right && !th.left && f.aimRaw > 0.4 ? W.rightDrag + dt : 0;
    W.noRight = th.right ? 0 : W.noRight + dt;
    // Aiming that never fires; not firing at all.
    if (f.aimActive && !f.fire) W.aimNoFire += dt;
    W.noFire = f.fire ? 0 : W.noFire + dt;
    // Taps (shoves), and the ones that hit nothing.
    let taps = 0;
    for (const e of f.events) if (e === 'shove') taps++;
    if (taps) {
      W.taps += taps;
      if (g.stats.shoveHits === W.lastHits) W.missed += taps;
    }
    W.lastHits = g.stats.shoveHits;
    // Standing still; and getting no closer to where the lesson points.
    W.still = Math.hypot(p.vx, p.vy) < 20 ? W.still + dt : 0;
    const s = this.step;
    const to = s.target ? s.target(this, g) : null;
    if (to) {
      const d = Math.hypot(to.x - p.x, to.y - p.y);
      if (d < W.best - 40) {
        W.best = d;
        W.noProgress = 0;
      } else W.noProgress += dt;
    }
  }

  /** Is anything on this list alive within r of the player? */
  close(list, r) {
    const p = this.game.player;
    return list.some((z) => z.alive && Math.hypot(z.x - p.x, z.y - p.y) < r);
  }

  /** The first of this lesson's nudges that applies takes the line for a few seconds (and is counted). */
  checkNudges(s, dt) {
    if (this.nudge) {
      this.nudge.t += dt;
      if (this.nudge.t >= NUDGE_SHOW && !this.nudge.n.stays) this.nudge = null;
      return;
    }
    if (!s.nudges) return;
    for (const n of s.nudges) {
      const key = `${s.id}.${n.id}`;
      if (this.nudgedAt[key] !== undefined && this.clock - this.nudgedAt[key] < NUDGE_AGAIN) continue;
      if (!n.when(this, this.game)) continue;
      this.nudge = { key, n, t: 0 };
      this.nudgedAt[key] = this.clock;
      this.nudges[key] = (this.nudges[key] || 0) + 1;
      // Start counting again, so the same thing has to happen again to bring it back.
      const W = this.watch;
      W.leftTaps = 0;
      W.taps = 0;
      W.missed = 0;
      W.aimNoFire = 0;
      return;
    }
  }

  // --- Zombies on cue ----------------------------------------------------------------------------

  /** n zombies from these spots, one after another over `over` seconds; they go into `list`. */
  spawn(points, n, over, list) {
    for (let k = 0; k < n; k++) {
      const q = points[k % points.length];
      this.queue.push({ x: q.x, y: q.y, t: (k / Math.max(1, n)) * over, list });
    }
  }

  updateQueue(dt) {
    for (let k = this.queue.length - 1; k >= 0; k--) {
      const q = this.queue[k];
      q.t -= dt;
      if (q.t > 0) continue;
      this.queue.splice(k, 1);
      const z = this.game.director.spawnAt(q.x, q.y, true);
      if (z) q.list.push(z);
    }
  }

  /** Everything queued for this list has turned up. */
  spawned(list) {
    return !this.queue.some((q) => q.list === list);
  }

  /** How many queued for this list are still to turn up. */
  pending(list) {
    return this.queue.reduce((n, q) => n + (q.list === list ? 1 : 0), 0);
  }

  /** This lesson's zombies are down, and so is anything an alarm brought. */
  cleared(list) {
    return left(list) === 0 && left(this.extra) === 0 && this.spawned(this.extra);
  }

  /** Called by the director when an alarm goes off here: two small waves instead of a panic event (the director says "YOU SHOT THE CAR!"). */
  alarmWave(wave) {
    const g = this.game;
    const n = [5, 3][wave] || 0;
    if (!n || !this.L.panicSpawns) return;
    this.alarmed = true;
    this.spawn(this.L.panicSpawns, n, 1.6, this.extra);
    const s = this.L.panicSpawns[0];
    g.audio.horde(s.x, s.y);
    g.stats.hordes++;
  }

  // --- The gates -----------------------------------------------------------------------------

  openGate(id) {
    const G = this.gates[id];
    if (!G || G.state !== 'shut') return;
    G.state = 'opening';
    G.f = 0;
    this.game.audio.switchOn();
  }

  updateGates(dt) {
    const g = this.game;
    for (const G of Object.values(this.gates)) {
      if (G.state !== 'opening') continue;
      G.f = Math.min(1, G.f + dt / GATE_OPEN);
      // The bars slide away into the wall on the east side.
      const b = G.bars;
      b.w = b.w0 * (1 - ease(G.f));
      b.x = b.x0 + b.w0 - b.w;
      if (G.f < 1) continue;
      G.state = 'open';
      g.world.removeObstacle(b);
      g.audio.gateOpen(G.x, G.y);
    }
  }

  /** The arrow's spot for a gate: just past it (or `ahead` units past it). */
  gateTarget(id, ahead = 70) {
    const G = this.gates[id];
    return { x: G.x, y: G.y - ahead, label: 'GATE' };
  }

  // --- What the lessons look at ------------------------------------------------------------

  /** The nearest of the pen's six still up (the edge arrow shows the way to them until one is in view). */
  penTarget() {
    const p = this.game.player;
    let best = null;
    let bd = Infinity;
    for (const z of this.pen) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best ? { x: best.x, y: best.y, label: 'TARGETS', marker: false } : null; // (the brackets mark them)
  }

  /** One of the pen's six has been hit. */
  penHurt() {
    return this.pen.some((z) => !z.alive || z.hp < 50);
  }

  /** The pen zombie your laser is on right now (aiming, not firing), or null. */
  aimedAt() {
    const g = this.game;
    const p = g.player;
    this.aimed = null;
    if (!p.alive || !p.aimActive || p.firing) return null;
    for (const z of this.pen) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d > p.weapon.def.range) continue;
      const tol = Math.max(5 * DEG, Math.asin(Math.min(1, (z.r + 5) / d)));
      if (Math.abs(wrapAngle(Math.atan2(z.y - p.y, z.x - p.x) - p.fireAngle)) > tol) continue;
      if (!g.world.segmentClear(p.x, p.y, z.x, z.y, g.world.shotBlockers)) continue;
      this.aimed = z;
      return z;
    }
    return null;
  }

  /** One of this map's stashes, by id (Day 2's crates). */
  crate(id) {
    return this.game.loot.stashes.find((s) => s.id === id) || null;
  }

  /**
   * Where a crowd comes from: groups of spots, best first. The spots of the
   * first group with any you can't see (off screen, or far off round a
   * corner); if you can see them all, the furthest one.
   */
  unseen(groups) {
    const g = this.game;
    const p = g.player;
    const far = (q) => Math.hypot(q.x - p.x, q.y - p.y);
    for (const group of groups) {
      const hidden = group.filter((q) => !g.onScreen(q.x, q.y, 40) || (far(q) > 380 && !g.world.segmentClear(p.x, p.y, q.x, q.y)));
      if (hidden.length) return hidden;
    }
    let best = groups[0][0];
    for (const q of groups.flat()) if (far(q) > far(best)) best = q;
    return [best];
  }

  /**
   * No Witch sits in the tutorial, but the tuning panel can still seat one.
   * Up, she takes one swipe (or chases you for a few seconds) and runs off:
   * nothing ends the tutorial.
   */
  watchWitch(dt) {
    const g = this.game;
    for (const w of g.witches) {
      if (!w.alive || w.mode === 'sit' || w.mode === 'flee') continue;
      w.tutT = (w.tutT || 0) + dt;
      if (w.swipes >= 1 || w.tutT > 5) {
        startFlee(g, w);
        g.announce("THAT'S WHY YOU LEAVE HER BE", '#cdbfe6', 2.6, 'small');
      }
    }
  }

  // --- Nobody dies here ----------------------------------------------------------------------

  /** At 0 HP: a second wind. Throws back what's on you; returns true (you live). */
  rescue() {
    const g = this.game;
    const p = g.player;
    p.hp = Math.max(1, Math.round(p.maxHp * RESCUE_HP));
    p.slowT = 0;
    if (p.pinnedBy) releasePin(g); // a Hunter (the tuning panel can still send one)
    for (const z of g.zombies) {
      if (!z.alive) continue;
      const dx = z.x - p.x;
      const dy = z.y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > RESCUE_PUSH) continue;
      if (z.type === 'witch') {
        if (z.mode !== 'sit' && z.mode !== 'flee') startFlee(g, z, true);
        continue;
      }
      const k = 1 - d / RESCUE_PUSH;
      z.vx += (dx / d) * (260 + 320 * k);
      z.vy += (dy / d) * (260 + 320 * k);
      if (z.staggerable) z.stagger = Math.max(z.stagger, 1.4);
      z.windup = 0;
      z.attackCd = Math.max(z.attackCd, 1.6);
    }
    g.effects.shoveArc(p.x, p.y, p.facing, RESCUE_PUSH * 0.6);
    g.effects.light(p.x, p.y, 240, 0.6, 0.8);
    g.effects.sparkle(p.x, p.y, 16);
    g.audio.deadstop();
    g.addTrauma(0.3);
    g.announce('CLOSE ONE!', '#ffd27a', 1.8);
    this.rescues++;
    return true;
  }

  // --- For the HUD and the report ------------------------------------------------------------

  /** Bring in the HUD up to this part (HUD_PARTS), from now. */
  revealUpTo(part) {
    const n = HUD_PARTS.indexOf(part);
    for (let k = 1; k <= n; k++) if (this.revealT[HUD_PARTS[k]] === undefined) this.revealT[HUD_PARTS[k]] = this.clock;
  }

  /** How much of each part of the HUD shows, 0..1 (fading in as it comes, on the tutorial's own clock): { shove, reload, all }. */
  hud() {
    const t = this.clock;
    const a = (k) => (this.revealT[k] === undefined ? 0 : clamp((t - this.revealT[k]) / REVEAL, 0, 1));
    return { shove: a('shove'), reload: a('reload'), all: a('all') };
  }

  /** The first screen (how to hold the phone): 1 while it's up, fading to 0 after the tap; 0 otherwise. */
  intro() {
    if (this.over || !this.step.intro) return 0;
    return this.pause > 0 ? clamp(this.pause / PAUSE, 0, 1) : 1;
  }

  /** Where the edge arrow points now (null: nowhere in particular). */
  arrow() {
    if (this.over || this.pause > 0) return null;
    const s = this.step;
    return s.target ? s.target(this, this.game) : null;
  }

  /** What the coaching shows: the line (null for none), whether it's a nudge, the count, the gesture, the ✓. */
  view(source) {
    const g = this.game;
    const s = this.step;
    const done = this.pause > 0 || this.over;
    const n = this.nudge && !done ? this.nudge.n : null;
    return {
      id: s.id,
      title: s.title,
      text: done ? null : stepText(n || s, source, this, g),
      nudge: !!n, // the line is a nudge: someone's doing it wrong
      count: s.count && !done ? s.count(this, g) : null,
      // A prompt up is all the coaching there is.
      coach: done || this.prompt ? null : (typeof s.coach === 'function' ? s.coach(this, g) : s.coach) || null,
      prompt: this.prompt ? this.prompt.kind : null,
      done: done && !!s.dot, // a ✓ for a lesson done
      t: this.t,
    };
  }

  report() {
    return {
      day: this.day,
      step: this.step.id,
      lessons: this.lessonsDone,
      of: this.of,
      rescues: this.rescues,
      alarm: this.alarmed,
      times: { ...this.times },
      nudges: { ...this.nudges }, // 'lesson.what': how often someone doing it wrong was told
    };
  }
}

// --- On this device ------------------------------------------------------------------------------

/** Has this device been through the tutorial of this day (to the safe room)? */
export function tutorialDone(day = 1) {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS[day]) || 'null');
    return !!(v && v.done);
  } catch {
    return false;
  }
}

export function saveTutorialDone(time = 0, day = 1) {
  try {
    localStorage.setItem(KEYS[day], JSON.stringify({ done: true, time: +clamp(time, 0, 1e5).toFixed(1), at: new Date().toISOString().slice(0, 10) }));
  } catch {
    // storage blocked: it'll be offered again, that's all
  }
}
