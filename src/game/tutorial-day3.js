// Tutorial 3's lessons: Day 3, the Hunter (the map is world/tutorial3-gen.js;
// src/game/tutorial.js runs these the same way as Day 1's and Day 2's, and
// the coaching on screen is render/tutorial-render.js).
//
// The first special infected, and what it asks of your thumbs: timing. It
// stalks and circles, then screams (crouched, a red line to you) and leaps.
//   1. Knock it out of the air: from its scream the world slows (to a third),
//      slower still in the leap, and stops with it in reach of a shove,
//      SHOVE lit; a shove pressed early waits for that. Then shoot it.
//   2. Break free: one jumps you from a doorway as you pass, at full speed:
//      pinned, SHOVE lit with the five dots over it; tap them full. Then
//      shoot it.
//   3. On your own: one more, and no slowing down.
//   4. A medkit past the last gate (if you're hurt), and the safe room.
// Day 1's coaching all the way: one short line at the top or none, the HUD a
// part at a time (the sticks alone, SHOVE when it's first asked for, the rest
// once one has you), and nobody dies. Everything the player reads is here.

import { HUNTER, spawnHunter, launch } from './specials.js';
import { LOST } from './tutorial-day2.js';

const near = (p, q, r) => Math.hypot(p.x - q.x, p.y - q.y) < r;
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** Halfway from you to it, but never more than FRAME_MAX from you. */
const FRAME_MAX = 260;
function halfway(p, h) {
  const k = Math.min(0.5, FRAME_MAX / Math.max(1, gap(p, h)));
  return { x: p.x + (h.x - p.x) * k, y: p.y + (h.y - p.y) * k };
}

const WATCH = { touch: 'Hunter! It screams, then leaps.' };
const AIR = { touch: 'Shove it out of the air!', mouse: 'Space: shove it out of the air!', pad: 'RB: shove it out of the air!' };
const SHOOT_IT = { touch: 'Now shoot it.', mouse: 'Now shoot it.', pad: 'Now shoot it.' };
const PINNED = { touch: 'Tap SHOVE, fast!', mouse: 'Tap Space, fast!', pad: 'Tap RB, fast!' };
const ALONE = { touch: 'Another one. On your own.' };
const NO_SHOVE = { touch: 'Tap the SHOVE button.', mouse: 'Press Space.', pad: 'Press RB.' };
const SHOOT = { touch: 'Push past the ring to shoot.', mouse: 'Click to shoot.', pad: 'Pull RT to shoot.' };
const MASH = { touch: 'Keep tapping SHOVE!', mouse: 'Keep tapping Space!', pad: 'Keep tapping RB!' };

/**
 * Pinned, in any lesson: SHOVE lit (the world going on: it's clawing you),
 * the break-free dots over it, until you're free. Returns whether you're pinned.
 */
function pinned(t, g, dt) {
  const on = !!g.player.pinnedBy;
  const P = t.prompt;
  const up = !!P && P.pin && !P.answered;
  if (on && !up) {
    t.reveal('shove');
    t.ask('shove', { stop: false, pin: true });
  } else if (!on && up) t.answer();
  t.pinnedFor = on ? (t.pinnedFor || 0) + dt : 0;
  return on;
}

/** The nudge for anyone pinned and not tapping their way out. */
const NOT_MASHING = { id: 'not-mashing', when: (t, g) => !!g.player.pinnedBy && t.pinnedFor > 2.5, text: MASH };

export const DAY3_STEPS = [
  {
    // It comes out of the alley once you're out on the street. From its
    // scream the world slows, and stops with it in the air in reach of a
    // shove; only SHOVE works then (pressed early, it waits). Until it's been
    // knocked down, bullets don't put it down either: the shove is the lesson.
    id: 'hunter',
    dot: true,
    title: 'KNOCK IT DOWN',
    hud: 'sticks', // the two sticks and nothing else, to start with
    text: (t, g) => (!t || !t.h ? null : g && g.player.pinnedBy ? PINNED : t.knocked ? SHOOT_IT : t.prompt && !t.prompt.answered ? AIR : WATCH),
    coach: (t) => (t.knocked && t.h && t.h.alive ? 'fire' : null),
    nudges: [
      { ...LOST, when: (t) => !t.h && LOST.when(t) },
      { id: 'no-shove', when: (t) => !!t.prompt && !t.prompt.pin && t.scale === 0 && t.prompt.t > 5, text: NO_SHOVE },
      NOT_MASHING,
      { id: 'not-shooting', when: (t) => t.knocked && t.watch.noFire > 4, text: SHOOT },
    ],
    enter: (t, g) => {
      t.h = null;
      t.knocked = false;
      t.group = [];
      t.base.deadstops = g.stats.deadstops;
    },
    // Along the street (it finds you before you're there).
    target: (t) => (t.h ? null : { ...t.L.hunter1Walk }),
    // Until it's down, the camera keeps you both in view: it looks halfway to it,
    // which keeps it off the buttons on the right as it screams.
    frame: (t, g) => (t.h && t.h.alive && !t.knocked && !g.player.pinnedBy ? halfway(g.player, t.h) : null),
    update: (t, g, dt) => {
      const p = g.player;
      if (!t.h) {
        const room = g.world.map.startRoom.outer;
        if (p.x < room.x + room.w + 30) return false;
        const s = t.L.hunter1;
        t.h = spawnHunter(g, s.x, s.y);
        t.h.pounceCd = 1.2; // a moment to see it first
        t.hp0 = t.h.hp;
        t.group = [t.h];
        return false;
      }
      const h = t.h;
      if (pinned(t, g, dt)) return false; // (it got you after all: off first)
      if (!t.knocked) {
        h.hp = Math.max(h.hp, t.hp0); // the shove first
        if (g.stats.deadstops > t.base.deadstops) {
          t.knocked = true;
          t.answer();
          t.watch.noFire = 0; // (from now on it's about shooting it)
          return false;
        }
        const coming = h.mode === 'crouch' || h.mode === 'leap';
        const up = !!t.prompt && !t.prompt.answered;
        if (coming && !up) {
          const ready = () => h.mode === 'leap' && gap(h, p) - h.r <= HUNTER.deadstopReach - 12;
          t.reveal('shove'); // SHOVE comes in, in the light
          t.ask('shove', { threat: h, ready, slow: () => (h.mode === 'crouch' ? 0.35 : h.mode !== 'leap' ? 1 : ready() ? 0 : 0.25) });
        } else if (!coming && up) t.answer(); // it backed off, or missed: the next scream
        return false;
      }
      return !h.alive;
    },
    done: (t) => t.openGate('g1'),
  },
  {
    id: 'gate1',
    title: "GATE'S OPEN",
    text: null,
    nudges: [LOST],
    target: (t) => t.gateTarget('g1'),
    update: (t, g) => g.player.y < t.L.gates.g1.y - 40,
  },
  {
    // As you come by the doorway it jumps you, at full speed: no slowing
    // down, nothing to dodge. Pinned: SHOVE lit with the dots over it, and
    // the rest of the HUD comes in (your health, going down while it claws).
    // Free of it, shoot it.
    id: 'pin',
    dot: true,
    title: 'BREAK FREE',
    text: (t, g) => (!t || !t.h ? null : g && g.player.pinnedBy ? PINNED : t.freed && t.h.alive ? SHOOT_IT : null),
    coach: (t, g) => (t.freed && t.h && t.h.alive && !g.player.pinnedBy ? 'fire' : null),
    nudges: [
      { ...LOST, when: (t) => !t.h && LOST.when(t) },
      NOT_MASHING,
      { id: 'not-shooting', when: (t) => t.freed && t.watch.noFire > 4, text: SHOOT },
    ],
    enter: (t, g) => {
      t.h = null;
      t.freed = false;
      t.group = [];
      t.base.breakFrees = g.stats.breakFrees;
      t.base.deadstops = g.stats.deadstops;
    },
    // Along the street, past the doorway.
    target: (t) => (t.h ? null : { ...t.L.ambushWalk }),
    update: (t, g, dt) => {
      const p = g.player;
      if (!t.h) {
        const W = t.L.ambushWalk;
        if (!near(p, W, 80) || Math.abs(p.x - t.L.door2.x) > 40) return false;
        const D = t.L.door2;
        const h = spawnHunter(g, D.x, D.y);
        launch(g, h, gap(h, p)); // straight out of the doorway at you
        t.revealUpTo('all'); // and the rest of the HUD: your health, while it claws
        t.h = h;
        t.group = [h];
        return false;
      }
      if (pinned(t, g, dt)) return false;
      if (!t.freed && (g.stats.breakFrees > t.base.breakFrees || g.stats.deadstops > t.base.deadstops)) {
        t.freed = true;
        t.watch.noFire = 0;
      }
      return !t.h.alive;
    },
    done: (t) => t.openGate('g2'),
  },
  {
    id: 'gate2',
    title: "GATE'S OPEN",
    text: null,
    nudges: [LOST],
    target: (t) => t.gateTarget('g2'),
    update: (t, g) => g.player.y < t.L.gates.g2.y - 40,
  },
  {
    // One more, out of the alley at the far end, and no slowing down: knock
    // it out of the air, step aside as it screams, or shoot it first. (Pinned,
    // SHOVE still lights up with its dots.)
    id: 'alone',
    dot: true,
    title: 'ON YOUR OWN',
    text: (t, g) => (g && g.player.pinnedBy ? PINNED : t && t.h && t.h.alive ? ALONE : null),
    nudges: [NOT_MASHING],
    // No slowing down, but the camera still keeps it in view (it comes down the
    // street at you, and a phone held sideways doesn't show far up or down).
    frame: (t, g) => (t.h && t.h.alive && !g.player.pinnedBy ? halfway(g.player, t.h) : null),
    enter: (t, g) => {
      const s = t.L.hunter3;
      t.h = spawnHunter(g, s.x, s.y);
      t.h.pounceCd = 1.5;
      t.group = [t.h];
    },
    update: (t, g, dt) => !pinned(t, g, dt) && !t.h.alive,
    done: (t) => t.openGate('g3'),
  },
  {
    // Past the last gate, a medkit on the way (skipped if you're not hurt).
    id: 'heal',
    dot: true,
    title: 'PATCH UP',
    text: { touch: 'Hurt? Walk over the medkit.' },
    skip: (t, g) => !t.healing && g.player.hp >= g.player.maxHp,
    enter: (t) => {
      t.healing = true;
    },
    target: (t) => ({ ...t.L.medkit, ring: true, r: 26 }),
    update: (t, g) => {
      const k = g.pickups.find((q) => q.kind === 'medkit' && near(q, t.L.medkit, 30));
      if (!k || k.taken || g.player.hp >= g.player.maxHp) {
        t.healing = false;
        return true;
      }
      return false;
    },
  },
  {
    id: 'saferoom',
    dot: true,
    title: 'SAFE ROOM',
    text: { touch: 'Get to the safe room.' },
    target: (t, g) => {
      const er = g.world.map.endRoom.interior;
      return { x: er.x + er.w / 2, y: er.y + er.h / 2, label: 'SAFE' };
    },
    update: (t, g) => g.won,
  },
];
