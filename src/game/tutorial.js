// The tutorial at run time (the map is world/tutorial-gen.js, the coaching on
// screen render/tutorial-render.js). One lesson after another, each with:
//   - a prompt, worded for whatever you play with (touch, mouse, pad),
//   - the gesture to show (a ghost thumb on the half of the screen it uses,
//     or a pulse round the button), and where to go (ring + edge arrow),
//   - the zombies it needs, spawned on cue and counted until they're down,
//   - what it holds back until then (no reload while you learn to shove,
//     no swapping while you reload), and the gate it opens when you're done.
// Nobody dies in the tutorial: at 0 HP you get a second wind instead.
// Everything the player reads is in STEPS, at the top, for editing.

import { startFlee } from './witch.js';
import { releasePin } from './specials.js';
import { DEG, wrapAngle, clamp } from '../util.js';

const KEY = 'funland2.p0.tutorial.v1';
const GATE_OPEN = 1.1; // s for the bars to slide back into the wall
const PAUSE = 0.9; // s between a lesson done (✓) and the next prompt
const AIM_HOLD = 0.45; // s of laser on a target that counts as "aimed"
const RESCUE_HP = 0.55; // of max HP: the second wind
const RESCUE_PUSH = 180; // u: what's that close gets thrown back

const left = (list) => list.reduce((n, z) => n + (z.alive ? 1 : 0), 0);
const near = (p, q, r) => Math.hypot(p.x - q.x, p.y - q.y) < r;
const ease = (f) => f * f * (3 - 2 * f);

/**
 * The lessons. text: what the card says, per input (pad falls back to mouse);
 * coach: the gesture drawn for touch ('move' | 'aim' | 'fire' | 'tap' |
 * 'reload' | 'swap'); dot: it is one of the lessons counted along the top of
 * the card. The functions get the Tutorial and the Game.
 */
export const STEPS = [
  {
    id: 'move',
    dot: true,
    title: 'MOVE',
    coach: 'move',
    text: {
      touch: 'Left thumb: touch anywhere on the left half and slide. Walk to the ring.',
      mouse: 'W A S D (or the arrow keys) to walk. Walk to the ring.',
      pad: 'Left stick to walk. Walk to the ring.',
    },
    target: (t) => ({ ...t.L.moveRing, ring: true, label: 'WALK HERE' }),
    update: (t, g) => near(g.player, t.L.moveRing, t.L.moveRing.r),
  },
  {
    id: 'aim',
    dot: true,
    title: 'AIM',
    coach: 'aim',
    text: {
      touch: 'Right thumb: touch the right half and drag, inside the dashed ring. Put your laser on one of them.',
      mouse: 'Point with the mouse: the laser is your aim. Put it on one of them.',
      pad: 'Tilt the right stick a little: the laser is your aim. Put it on one of them.',
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
      touch: 'Push past the dashed ring to shoot. Drop all three.',
      mouse: 'Click to shoot. Drop all three.',
      pad: 'Push the right stick all the way (or pull RT) to shoot. Drop all three.',
    },
    target: (t) => t.penTarget(),
    count: (t) => `${t.pen.length - left(t.pen)}/${t.pen.length}`,
    update: (t) => left(t.pen) === 0,
    done: (t) => t.openGate('g1'),
  },
  {
    id: 'gate1',
    title: "GATE'S OPEN",
    text: { touch: 'Through the gate. The green arrow at the edge of the screen points the way.' },
    target: (t) => t.gateTarget('g1'),
    update: (t, g) => g.player.y < t.L.gates.g1.y - 40,
  },
  {
    id: 'shove',
    dot: true,
    title: 'SHOVE',
    coach: 'tap',
    text: {
      touch: 'Click. Empty! Tap the right side (or SHOVE) to knock them back.',
      mouse: 'Click. Empty! Space or right-click to knock them back.',
      pad: 'Click. Empty! RB to knock them back.',
    },
    enter: (t, g) => {
      // Back to the SMG, and it's dry: no reloading or swapping until you've shoved.
      const p = g.player;
      p.weapon.reloading = false;
      p.wi = 0;
      p.weapon.mag = 0;
      p.weapon.reloading = false;
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
    coach: 'reload',
    text: {
      touch: "Tap ⟳ to reload. Don't wait to run dry.",
      mouse: "Press R to reload. Don't wait to run dry.",
      pad: "Press X to reload. Don't wait to run dry.",
    },
    enter: (t) => t.lock(false, true),
    update: (t, g) => g.player.weapon.reloading || g.player.weapon.mag > 0,
  },
  {
    id: 'finish',
    title: 'FINISH THEM',
    coach: 'fire',
    text: {
      touch: 'Aim at one and push past the ring.',
      mouse: 'Click to shoot.',
      pad: 'Right stick all the way, or RT.',
    },
    count: (t) => `${t.group.length - left(t.group)}/${t.group.length}`,
    update: (t) => t.spawned(t.group) && t.cleared(t.group),
  },
  {
    id: 'swap',
    dot: true,
    title: 'SWAP GUNS',
    coach: 'swap',
    text: {
      touch: 'Tap the gun panel (top right) until you hold the PUMP SHOTGUN.',
      mouse: 'Q or the mouse wheel swaps guns. Get the PUMP SHOTGUN.',
      pad: 'Y swaps guns. Get the PUMP SHOTGUN.',
    },
    enter: (t) => t.lock(false, false),
    count: (t, g) => g.player.weapon.def.name.toUpperCase(),
    update: (t, g) => g.player.weapon.def.id === 'shotgun',
  },
  {
    id: 'pack',
    dot: true,
    title: 'A PACK!',
    coach: 'fire',
    text: {
      touch: 'The shotgun hits everything in front of you. Let them bunch up, then fire.',
      mouse: 'The shotgun hits everything in front of you. Let them bunch up, then click.',
    },
    enter: (t, g) => {
      t.group = [];
      t.spawn([t.L.packSpawn], 5, 1.4, t.group);
      g.audio.horde(t.L.packSpawn.x, t.L.packSpawn.y);
    },
    count: (t) => `${t.group.length - left(t.group)}/5`,
    update: (t) => t.spawned(t.group) && t.cleared(t.group),
  },
  {
    id: 'search',
    dot: true,
    title: 'SUPPLIES',
    text: { touch: 'Follow the chalk arrows. Stand on the crate to search it.' },
    target: (t) => {
      const s = t.stash();
      return s ? { x: s.x, y: s.y, label: 'CRATE' } : null;
    },
    update: (t) => !t.stash() || t.stash().opened,
    done: (t) => t.openGate('g2'),
  },
  {
    id: 'gate2',
    title: "GATE'S OPEN",
    text: { touch: 'Through the gate. Quietly, now: listen.' },
    target: (t) => t.gateTarget('g2'),
    update: (t, g) => g.player.y < t.L.gates.g2.y - 40,
  },
  {
    id: 'witch',
    dot: true,
    title: 'LEAVE HER BE',
    text: {
      touch: "That crying is a Witch. Pass on the far side, keep your aim (and your light) off her, and don't shoot near her.",
    },
    skip: (t) => !t.witch(),
    target: (t) => ({ ...t.L.witchPass, ring: true, label: 'FAR SIDE' }),
    update: (t, g) => {
      const w = t.witch();
      if (!w || !w.alive) return true; // she ran off (or worse)
      const past = g.player.x > w.seat.x + 300 || near(g.player, t.L.witchPass, t.L.witchPass.r);
      if (w.mode !== 'sit' || !past) return false;
      if (!w.spared) {
        w.spared = true;
        g.stats.witchSpared++;
        g.announce('LEFT HER IN PEACE', '#cdbfe6', 1.8, 'small');
      }
      return true;
    },
  },
  {
    id: 'alarm',
    dot: true,
    title: "DON'T SHOOT THE CAR",
    text: { touch: 'A blinking red light means an alarm. Let them come around the car, then shoot.' },
    enter: (t) => {
      t.group = [];
      t.spawn(t.L.alarmSpawns, 4, 1.2, t.group);
    },
    count: (t) => `${t.group.length - left(t.group)}/4`,
    update: (t, g) => t.spawned(t.group) && t.cleared(t.group) && !g.director.alarm,
  },
  {
    id: 'horde',
    dot: true,
    title: 'HOLD THE LINE',
    coach: 'tap',
    text: {
      touch: 'Back to a wall. Shoot, and tap to shove the ones that get on you.',
      mouse: 'Back to a wall. Shoot, and shove (Space) the ones that get on you.',
      pad: 'Back to a wall. Shoot, and shove (RB) the ones that get on you.',
    },
    enter: (t, g) => {
      t.group = [];
      t.spawn(t.L.hordeSpawns, 10, 3.2, t.group);
      const s = t.L.hordeSpawns[0];
      g.audio.horde(s.x, s.y);
      g.stats.hordes++;
      g.announce('HERE THEY COME!', '#ff6b5a', 2.2);
    },
    count: (t) => `${t.group.length - left(t.group)}/10`,
    update: (t) => t.spawned(t.group) && t.cleared(t.group),
    done: (t) => t.openGate('g3'),
  },
  {
    id: 'saferoom',
    dot: true,
    title: 'SAFE ROOM',
    text: { touch: 'The gate is open. Get inside the safe room.' },
    target: (t, g) => {
      const er = g.world.map.endRoom.interior;
      return { x: er.x + er.w / 2, y: er.y + er.h / 2, label: 'SAFE' };
    },
    update: (t, g) => g.won,
  },
];

/** The lessons that count (the dots along the top of the card). */
export const LESSONS = STEPS.filter((s) => s.dot).length;

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
    this.rescues = 0;
    this.alarmed = false;
    this.finished = false; // reached the safe room (remembered on the device)
    this.times = {};
    game.locks = { reload: false, swap: false };
    // The gates, shut.
    this.gates = {};
    for (const [id, G] of Object.entries(this.L.gates)) this.gates[id] = { ...G, state: 'shut', f: 0 };
    // Three of them in the pen, waiting for the lesson that needs them.
    this.pen = this.L.penZombies.map((q) => game.director.spawnAt(q.x, q.y, false)).filter(Boolean);
    for (const z of this.pen) z.penned = true;
    this.next();
  }

  get step() {
    return STEPS[Math.max(0, Math.min(this.i, STEPS.length - 1))];
  }

  /** How many of the counted lessons are behind you. */
  get lessonsDone() {
    let n = 0;
    for (let k = 0; k < STEPS.length; k++) if (STEPS[k].dot && (k < this.i || (k === this.i && this.pause > 0) || this.over)) n++;
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
      if (this.i >= STEPS.length) {
        this.over = true;
        this.i = STEPS.length - 1;
        this.lock(false, false);
        return;
      }
      const s = STEPS[this.i];
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
      saveTutorialDone(g.stats.time);
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

  /** This lesson's zombies are down, and so is anything an alarm brought. */
  cleared(list) {
    return left(list) === 0 && left(this.extra) === 0 && this.spawned(this.extra);
  }

  /** Called by the director when an alarm goes off here: two small waves instead of a panic event. */
  alarmWave(wave) {
    const g = this.game;
    const n = [5, 3][wave] || 0;
    if (!n) return;
    this.alarmed = true;
    this.spawn(this.L.panicSpawns, n, 1.6, this.extra);
    const s = this.L.panicSpawns[0];
    g.audio.horde(s.x, s.y);
    g.stats.hordes++;
    if (wave === 0) {
      g.announce("THAT'S WHAT ALARMS DO", '#ffb347', 2.4);
      g.announce('HOLD ON!', 'rgba(255,236,200,0.9)', 2.4, 'small');
    }
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
      g.announce('GATE OPEN', '#7dffa1', 1.6, 'small');
    }
  }

  gateTarget(id) {
    const G = this.gates[id];
    return { x: G.x, y: G.y - 70, label: 'GATE' };
  }

  // --- What the lessons look at ------------------------------------------------------------

  /** The nearest of the pen's three still up (the edge arrow shows the way to them until one is in view). */
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

  /** One of the pen's three has been hit. */
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

  stash() {
    return this.game.loot.stashes.find((s) => s.id === this.L.stash) || null;
  }

  witch() {
    return this.game.witches[0] || null;
  }

  /**
   * She is up: one swipe (or a few seconds of chasing you) and she runs off.
   * In a real run she wouldn't stop; the lesson is that she gets up at all.
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
    g.announce('SHOVE THEM OFF WHEN THEY GET CLOSE', 'rgba(255,236,200,0.9)', 2.6, 'small');
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
      coach: this.pause > 0 || this.over ? null : s.coach || null,
      done: this.pause > 0 || this.over,
      lessons: this.lessonsDone,
      of: LESSONS,
      t: this.t,
    };
  }

  report() {
    return {
      step: this.step.id,
      lessons: this.lessonsDone,
      of: LESSONS,
      rescues: this.rescues,
      alarm: this.alarmed,
      times: { ...this.times },
    };
  }
}

// --- On this device ------------------------------------------------------------------------------

/** Has this device been through the tutorial (to the safe room)? */
export function tutorialDone() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return !!(v && v.done);
  } catch {
    return false;
  }
}

export function saveTutorialDone(time = 0) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ done: true, time: +clamp(time, 0, 1e5).toFixed(1), at: new Date().toISOString().slice(0, 10) }));
  } catch {
    // storage blocked: it'll be offered again, that's all
  }
}
