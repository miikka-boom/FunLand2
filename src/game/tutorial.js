// The tutorial at run time (the map is world/tutorial-gen.js, the coaching on
// screen render/tutorial-render.js). One lesson after another, each with:
//   - a prompt, worded for whatever you play with (touch, mouse, pad),
//   - the gesture to show (a ghost thumb on the half of the screen it uses,
//     or a pulse round the button), and where to go (ring + edge arrow),
//   - the zombies it needs, spawned on cue and counted until they're down,
//   - what it holds back until then (no reload while you learn to shove),
//     and the gate it opens when you're done.
// One gun all the way through (the final game has no weapon changing, so the
// tutorial doesn't teach it: the gun panel stays shut). No Witch either: she
// is too much for a first run. Nobody dies in the tutorial: at 0 HP you get a
// second wind instead.
// It's short on purpose: eight lessons on three short streets, a couple of
// minutes for a first-timer. Everything the player reads is in STEPS, at the
// top, for editing.
//
// Tutorial 2 (Day 2: supplies, a boarded room, the secret) runs on the same
// runner with its own lessons (tutorial-day2.js) and map (map.tutorial.day).

import { startFlee } from './witch.js';
import { releasePin } from './specials.js';
import { DAY2_STEPS } from './tutorial-day2.js';
import { DEG, wrapAngle, clamp, pointInRect } from '../util.js';

/** Done on this device, per day (Day 1's key is the one it always had). */
const KEYS = { 1: 'funland2.p0.tutorial.v1', 2: 'funland2.p0.tutorial2.v1' };
const GATE_OPEN = 1.1; // s for the bars to slide back into the wall
const PAUSE = 0.6; // s between a lesson done (✓) and the next prompt
const AIM_HOLD = 0.45; // s of laser on a target that counts as "aimed"
const RESCUE_HP = 0.55; // of max HP: the second wind
const RESCUE_PUSH = 180; // u: what's that close gets thrown back

const left = (list) => list.reduce((n, z) => n + (z.alive ? 1 : 0), 0);
const near = (p, q, r) => Math.hypot(p.x - q.x, p.y - q.y) < r;
const ease = (f) => f * f * (3 - 2 * f);

/**
 * The lessons. text: what the card says, per input (pad falls back to mouse);
 * coach: the gesture drawn for touch ('move' | 'aim' | 'fire' | 'tap' |
 * 'reload' | 'kite': both thumbs at once), or a function that picks one as the
 * lesson goes; dot: it is one of the lessons counted along the top of the
 * card. The functions get the Tutorial and the Game.
 */
export const STEPS = [
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
    target: (t) => ({ ...t.L.moveRing, ring: true }),
    update: (t, g) => near(g.player, t.L.moveRing, t.L.moveRing.r),
  },
  {
    id: 'aim',
    dot: true,
    title: 'AIM',
    coach: 'aim',
    text: {
      touch: 'Right thumb, gently: laser on one.',
      mouse: 'Point the mouse: laser on one.',
      pad: 'Right stick, gently: laser on one.',
    },
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
      pad: 'Right stick all the way (or RT) to shoot.',
    },
    target: (t) => t.penTarget(),
    count: (t) => `${t.pen.length - left(t.pen)}/${t.pen.length}`,
    update: (t) => left(t.pen) === 0,
    done: (t) => t.openGate('g1'),
  },
  {
    id: 'gate1',
    title: "GATE'S OPEN",
    text: { touch: 'Through the gate.' },
    target: (t) => t.gateTarget('g1'),
    update: (t, g) => g.player.y < t.L.gates.g1.y - 40,
  },
  {
    id: 'shove',
    dot: true,
    title: 'SHOVE',
    coach: 'tap',
    text: {
      touch: 'Empty! Tap the right side to shove.',
      mouse: 'Empty! Space to shove.',
      pad: 'Empty! RB to shove.',
    },
    enter: (t, g) => {
      // The gun is dry, and no reloading until you've shoved.
      const w = g.player.weapon;
      w.mag = 0;
      w.reloading = false;
      t.lock(true, true);
      g.audio.dryFire();
      t.group = [];
      t.spawn([t.L.shoveSpawn], 2, 0.5, t.group);
      t.base.hits = g.stats.shoveHits;
    },
    count: (t, g) => `${Math.min(3, g.stats.shoveHits - t.base.hits)}/3`,
    update: (t, g) => g.stats.shoveHits - t.base.hits >= 3 || (t.spawned(t.group) && left(t.group) === 0),
  },
  {
    id: 'reload',
    dot: true,
    title: 'RELOAD',
    // The ⟳ button pulses until the gun is loading; then the fire thumb.
    coach: (t) => (t.reloaded ? 'fire' : 'reload'),
    text: {
      touch: 'Tap ⟳, then finish them.',
      mouse: 'R to reload, then finish them.',
      pad: 'X to reload, then finish them.',
    },
    enter: (t) => {
      t.reloaded = false;
      t.lock(false, true);
    },
    count: (t) => `${t.group.length - left(t.group)}/${t.group.length}`,
    update: (t, g) => {
      const w = g.player.weapon;
      if (w.reloading || w.mag > 0) t.reloaded = true;
      return t.reloaded && t.spawned(t.group) && t.cleared(t.group);
    },
  },
  {
    id: 'kite',
    dot: true,
    title: 'BOTH THUMBS',
    coach: 'kite',
    text: {
      touch: 'Left thumb back, right thumb shoot.',
      mouse: 'Back off and shoot at once.',
      pad: 'Back off and shoot at once.',
    },
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
    text: { touch: 'One more street.' },
    target: (t) => t.gateTarget('g2'),
    // Done once you're out on row 3, where the car is in plain view.
    update: (t, g) => g.player.y < t.L.gates.g2.y - 130,
  },
  {
    id: 'alarm',
    dot: true,
    title: "DON'T SHOOT THE CAR",
    text: { touch: 'Red light = alarm. Let them come around it.' },
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
    text: { touch: 'Get to the safe room!' },
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

/** The lessons that count (the dots along the top of the card). */
export const LESSONS = STEPS.filter((s) => s.dot).length;

/** Each day's lessons, by map.tutorial.day. */
export const COURSES = { 1: STEPS, 2: DAY2_STEPS };

/** The tutorial level ids, in order (each one, won, leads to the next; after the last, the Streets). */
export const TUTORIAL_LEVELS = ['tutorial', 'tutorial2'];

/** Words for an input source: touch | mouse | gamepad. */
export function stepText(step, source) {
  const T = step.text;
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
    this.t = 0; // seconds in this lesson
    this.pause = 0; // seconds left of the ✓ before the next one
    this.over = false;
    this.queue = []; // zombies still to come: { x, y, t, list }
    this.group = []; // the current lesson's zombies
    this.extra = []; // whatever an alarm brought (they have to go too)
    this.base = { hits: 0 };
    this.aimT = 0;
    this.aimed = null;
    this.reloaded = false; // the reload lesson: the gun is loading
    this.rescues = 0;
    this.alarmed = false;
    this.finished = false; // reached the safe room (remembered on the device)
    this.times = {};
    game.locks = { reload: false, swap: true }; // one gun, all the way through
    // The gates, shut.
    this.gates = {};
    for (const [id, G] of Object.entries(this.L.gates)) this.gates[id] = { ...G, state: 'shut', f: 0 };
    // Day 1: six of them in the pen, waiting for the lesson that needs them.
    this.pen = (this.L.penZombies || []).map((q) => game.director.spawnAt(q.x, q.y, false)).filter(Boolean);
    for (const z of this.pen) z.penned = true;
    // Day 2: whoever is nailed in with the good stuff (spawned with the map's boarded room).
    this.sleepers = this.L.room ? game.zombies.filter((z) => z.alive && pointInRect(z.x, z.y, this.L.room, 4)) : [];
    this.need = 0;
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

  lock(reload, swap) {
    this.game.locks.reload = reload;
    this.game.locks.swap = swap;
  }

  /** On to the next lesson (skipping any that don't apply on this run). */
  next() {
    const g = this.game;
    for (;;) {
      this.i++;
      if (this.i >= this.steps.length) {
        this.over = true;
        this.i = this.steps.length - 1;
        this.lock(false, true);
        return;
      }
      const s = this.steps[this.i];
      if (s.skip && s.skip(this, g)) continue;
      this.t = 0;
      if (s.enter) s.enter(this, g);
      return;
    }
  }

  complete() {
    const g = this.game;
    const s = this.step;
    this.times[s.id] = +this.t.toFixed(1);
    if (s.done) s.done(this, g);
    this.pause = PAUSE;
    if (s.dot) g.audio.pickup();
  }

  update(dt) {
    const g = this.game;
    this.updateQueue(dt);
    this.updateGates(dt);
    this.watchWitch(dt);
    if (g.won && !this.finished) {
      this.finished = true;
      saveTutorialDone(g.stats.time, this.day);
    }
    if (this.over) return;
    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) {
        this.pause = 0;
        this.next();
      }
      return;
    }
    this.t += dt;
    const s = this.step;
    if (s.update(this, g, dt)) this.complete();
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

  gateTarget(id) {
    const G = this.gates[id];
    return { x: G.x, y: G.y - 70, label: 'GATE' };
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
    return best ? { x: best.x, y: best.y, label: 'TARGETS' } : null;
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

  /** Where the edge arrow points now (null: nowhere in particular). */
  arrow() {
    if (this.over || this.pause > 0) return null;
    const s = this.step;
    return s.target ? s.target(this, this.game) : null;
  }

  /** What the card shows. */
  view(source) {
    const g = this.game;
    const s = this.step;
    return {
      id: s.id,
      title: s.title,
      text: stepText(s, source),
      count: s.count && !this.over ? s.count(this, g) : null,
      coach: this.pause > 0 || this.over ? null : (typeof s.coach === 'function' ? s.coach(this, g) : s.coach) || null,
      done: this.pause > 0 || this.over,
      lessons: this.lessonsDone,
      of: this.of,
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
