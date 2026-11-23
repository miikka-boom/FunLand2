// The tutorial: three short lessons for a first-time player, at run time.
// (Maps: world/tutorial-gen.js. What's drawn: render/tutorial-hud.js.)
//
//   1. Move & shoot:   the left thumb walks, the right thumb aims, past the
//                      dashed ring it fires; both at once; the safe room.
//   2. Shove & reload: a tap on the right side shoves (time slows the first
//                      time one reaches you); the reload button; swapping
//                      guns; a crowd down a narrow alley.
//   3. First run:      a real run in miniature: the green arrow, supplies,
//                      an alarm car, the Witch, a horde, the safe room.
//
// A lesson is a list of steps. Each step says what to do (per input: touch
// first, then keys and pad), which gesture to act out on screen, where to go
// (a ring on the ground and the arrow at the screen edge), and when it's
// done. Steps only ever move forward, and there's always a way through: the
// survivor can't die in a lesson (health stops at HP_FLOOR), zombies that
// should have been shoved but got shot are sent again, and the safe room's
// door opens when the last step starts.

import { Zombie, alertZombie } from './zombies.js';
import { Witch } from './witch.js';
import { pointInRect, dampFactor, rand } from '../util.js';

const STORE_KEY = 'funland2.p0.tutorial.v1';
/** In a lesson your health never drops below this: you can get hurt, not killed. */
export const HP_FLOOR = 15;
/** The Witch of lesson 3 is a lot easier to put down than the real ones. */
const WITCH_HP = 0.4;

export const LESSONS = [
  {
    n: 1,
    name: 'Move & shoot',
    blurb: 'Walk, aim and fire',
    about: 'walk, aim and fire. About a minute.',
    learned: ['Left thumb walks', 'Right thumb aims', 'Past the ring fires', 'Walk and shoot at once', 'Safe room = done'],
  },
  {
    n: 2,
    name: 'Shove & reload',
    blurb: 'Get them off you',
    about: 'shove them off you, reload, swap guns, clear a crowd.',
    learned: ['Tap right side to shove', 'Shove, then shoot', 'Reload with ⟳', 'Tap your gun to swap', 'Shotgun the crowd'],
  },
  {
    n: 3,
    name: 'First run',
    blurb: 'A whole run, small',
    about: 'a whole run in small: supplies, an alarm car, the Witch, a horde.',
    learned: ['Follow the green arrow', 'Search supplies', 'Never hit alarm cars', 'Leave the Witch be', 'Hold off a horde'],
  },
];
export const LESSON_COUNT = LESSONS.length;

// --- Progress (this device) -------------------------------------------------------------------

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readStore() {
  try {
    const raw = storage() && storage().getItem(STORE_KEY);
    const d = raw ? JSON.parse(raw) : null;
    if (d && typeof d === 'object') return d;
  } catch {
    // unreadable: start over
  }
  return {};
}

function writeStore(d) {
  try {
    storage().setItem(STORE_KEY, JSON.stringify(d));
  } catch {
    // storage blocked: it's remembered for this visit only
  }
}

/** Lesson numbers finished on this device, e.g. [1, 2]. */
export function lessonsDone() {
  const d = readStore();
  if (Array.isArray(d.done)) return d.done.filter((n) => Number.isInteger(n) && n >= 1 && n <= LESSON_COUNT).sort((a, b) => a - b);
  return [];
}

export function markLessonDone(n) {
  const done = lessonsDone();
  if (!done.includes(n)) done.push(n);
  writeStore({ ...readStore(), done: done.sort((a, b) => a - b) });
  return done;
}

/** Picked a map over the next lesson: the title stops offering the tutorial first (until a lesson is picked again). */
export function tutorialSkipped() {
  return !!readStore().skipped;
}

export function setTutorialSkipped(on) {
  const d = readStore();
  if (!!d.skipped === !!on) return;
  writeStore({ ...d, skipped: !!on });
}

export function forgetLessons() {
  try {
    storage().removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}

/** The first lesson not finished yet (0 when all are). */
export function nextLesson(done = lessonsDone()) {
  for (let n = 1; n <= LESSON_COUNT; n++) if (!done.includes(n)) return n;
  return 0;
}

// --- The lessons' steps ----------------------------------------------------------------------
//
// A step (any field may also be a function of the Tutorial, T):
//   id, title     the step, and its name on the coach panel
//   text          { touch, pc, pad }: what to do, worded for the input in use
//   hint          the gesture the ghost thumb acts out (touch only): 'move' | 'aim' |
//                 'fire' | 'tap' | 'both' | 'reload' | 'swap' | null
//   ring, label   where to go: a ring on the ground (and its label); seq: rings in order
//   arrow         the edge arrow: at the ring (default), 'goal' (the safe room), false (none)
//   tag, tagLabel the zombies the step is about (spawned with that tag), and their label
//   point         something else to label: 'alarm' (the car), 'witch', 'arrow' (the edge arrow)
//   count         the counter shown after the title ("2/3")
//   skip          true: the step is passed over (the medkit one, when you aren't hurt)
//   enter, update what happens as it starts; update returns true when it's done
//   onShove       player.shove() reports what it hit
//   praise        said as it's done (with a chime), or null

const P = (T) => T.game.player;

function lesson1(T) {
  const S = T.spots;
  const pen = () => T.group('pen');
  return [
    {
      id: 'move',
      title: 'MOVE',
      text: {
        touch: 'LEFT thumb: touch anywhere on the left side and slide. Walk to the ring.',
        pc: 'W A S D (or the arrow keys) to walk. Walk to the ring.',
        pad: 'Left stick to walk. Walk to the ring.',
      },
      hint: 'move',
      ring: S.rings[0],
      label: 'WALK HERE',
      update: (T) => T.at(S.rings[0]),
      praise: 'NICE!',
    },
    {
      id: 'rings',
      title: 'KEEP MOVING',
      text: {
        touch: 'The stick follows your thumb: slide the way you want to go. Through the rings!',
        pc: 'Walk through the rings.',
        pad: 'Walk through the rings.',
      },
      hint: (T) => (T.idle > 2.5 ? 'move' : null),
      seq: [S.rings[1], S.rings[2], S.aimSpot],
      label: 'NEXT',
      count: (T) => `${T.seqI}/${T.step.seq.length}`,
      enter: (T) => {
        // The pen's three wake up and come to the fence as you walk over.
        for (const s of S.pen.sleepers) T.spawn('pen', s.x, s.y, { alert: false, speed: 0.6 });
      },
      update: (T) => T.walkSeq(),
      praise: 'GOOD MOVES!',
    },
    {
      id: 'aim',
      title: 'AIM',
      text: {
        touch: 'RIGHT thumb: slide a little toward a zombie. The laser shows your aim.',
        pc: 'Point the mouse at a zombie. The laser shows your aim.',
        pad: 'Right stick, gently, toward a zombie. The laser shows your aim.',
      },
      hint: 'aim',
      tag: 'pen',
      tagLabel: 'AIM HERE',
      arrow: false,
      enter: (T) => {
        // They've seen you: up against the fence they come (it holds).
        for (const z of pen().list) if (z.alive) alertZombie(T.game, z, rand(0.1, 0.5), false);
      },
      update: (T, dt) => {
        if (pen().alive < 3) return true; // a shot already: that's aiming too
        if (T.aimingAt('pen')) T.held += dt;
        return T.held > 0.45;
      },
      praise: 'ON TARGET!',
    },
    {
      id: 'fire',
      title: 'FIRE!',
      text: {
        touch: 'Push PAST the dashed ring to shoot. Bullets fly over sandbags. Get all three!',
        pc: 'Click (hold) to shoot. Bullets fly over sandbags. Get all three!',
        pad: 'Push the right stick all the way (or pull RT) to shoot. Get all three!',
      },
      hint: 'fire',
      tag: 'pen',
      tagLabel: 'SHOOT',
      arrow: false,
      count: () => `${3 - pen().alive}/3`,
      update: () => pen().alive === 0,
      praise: 'CLEAN SHOOTING!',
    },
    {
      id: 'both',
      title: 'WALK + SHOOT',
      text: {
        touch: 'More are coming! Use BOTH thumbs: back away with the left, shoot with the right.',
        pc: 'More are coming! Back away with W A S D and shoot with the mouse.',
        pad: 'More are coming! Back away with the left stick, shoot with the right.',
      },
      hint: 'both',
      tag: 'walkers',
      arrow: false,
      count: () => `${5 - T.group('walkers').alive - T.pending}/5`,
      enter: (T) => {
        for (const g of S.penGates || []) T.openGate(g);
        // Three come through the gates, two more a moment behind them.
        S.walkers.forEach((s, i) => {
          T.later(i < 3 ? 0.2 * i : 3.5 + 0.6 * (i - 3), () => T.spawn('walkers', s.x, s.y, { alert: true, speed: i < 3 ? 0.52 : 0.6 }), true);
        });
      },
      update: (T) => T.pending === 0 && T.group('walkers').alive === 0,
      praise: "THAT'S THE GAME!",
    },
    safeRoomStep('The door is open. Walk into the SAFE ROOM to finish the lesson.'),
  ];
}

function lesson2(T) {
  const S = T.spots;
  let shoved = 0; // shove hits on the step's zombies
  return [
    {
      id: 'shove',
      title: 'SHOVE',
      text: (T) =>
        T.slowMo < 1
          ? { touch: 'NOW! A quick TAP anywhere on the right side!', pc: 'NOW! Press SPACE (or right-click)!', pad: 'NOW! Press RB!' }
          : {
            touch: "One's coming. Don't shoot: let it get close, then TAP the right side to SHOVE.",
            pc: "One's coming. Don't shoot: let it get close, then SPACE (or right-click) to SHOVE.",
            pad: "One's coming. Don't shoot: let it get close, then RB to SHOVE.",
          },
      hint: (T) => (T.closest('first') < 220 ? 'tap' : null),
      tag: 'first',
      tagLabel: (T) => (T.slowMo < 1 ? 'TAP NOW!' : 'LET IT COME'),
      // Into the alley to meet it (it's a long wait in the safe room), until it's close.
      ring: (T) => (T.closest('first') < 260 ? null : S.meet),
      label: 'WAIT HERE',
      enter: (T) => {
        shoved = 0;
        T.spawn('first', S.first[0].x, S.first[0].y, { alert: true, speed: 0.5 });
      },
      update: (T) => {
        const g = T.group('first');
        // Shot down before it was shoved: send another, a bit closer.
        if (g.alive === 0 && !shoved) {
          T.announceSmall('LET IT COME CLOSE, THEN TAP', '#ffd27a');
          if (!T.spawnAhead('first', 380, { speed: 0.5 })) T.spawn('first', S.first[0].x, S.first[0].y, { alert: true, speed: 0.5 });
        }
        // Time slows as it reaches for you (the first time, and until you shove).
        T.slowMo = !shoved && T.closest('first') < 96 ? 0.22 : 1;
        return shoved > 0;
      },
      onShove: (T, list) => {
        if (list.some((z) => z.tut === 'first')) shoved++;
      },
      praise: 'SHOVED!',
    },
    {
      id: 'shoot1',
      title: 'NOW SHOOT',
      text: {
        touch: "It's dazed. Shoot it before it gets up!",
        pc: "It's dazed. Shoot it before it gets up!",
        pad: "It's dazed. Shoot it before it gets up!",
      },
      hint: 'fire',
      tag: 'first',
      arrow: false,
      update: (T) => T.group('first').alive === 0,
      praise: 'SHOVE, THEN SHOOT. PERFECT.',
    },
    {
      id: 'pair',
      title: 'TWO MORE',
      text: {
        touch: 'Two at once: TAP to shove them back, then shoot.',
        pc: 'Two at once: SPACE to shove them back, then shoot.',
        pad: 'Two at once: RB to shove them back, then shoot.',
      },
      hint: (T) => (T.closest('pair') < 120 ? 'tap' : 'fire'),
      tag: 'pair',
      arrow: false,
      count: () => `${2 - T.group('pair').alive}/2`,
      enter: (T) => {
        for (const s of S.pair) T.spawn('pair', s.x, s.y, { alert: true, speed: 0.55 });
      },
      update: (T) => T.group('pair').alive === 0,
      praise: 'NICE AND CLEAN!',
    },
    {
      id: 'reload',
      title: 'RELOAD',
      text: {
        touch: 'Almost empty! Tap ⟳ to RELOAD now, before the next fight.',
        pc: 'Almost empty! Press R to RELOAD now, before the next fight.',
        pad: 'Almost empty! Press X to RELOAD now, before the next fight.',
      },
      hint: 'reload',
      arrow: false,
      enter: (T) => {
        const w = P(T).weapon;
        if (!w.reloading && w.mag > Math.ceil(w.cap * 0.2)) {
          w.mag = Math.max(1, Math.round(w.cap * 0.12));
          T.game.announce('LOW AMMO', '#ffb25a', 1.4, 'small');
        }
      },
      update: (T) => P(T).weapon.reloading || P(T).weapon.mag === P(T).weapon.cap,
      praise: 'GOOD HABIT!',
    },
    {
      id: 'swap',
      title: 'SWAP GUNS',
      text: {
        touch: 'Tap your gun (top right) to switch guns.',
        pc: 'Press Q (or turn the mouse wheel) to switch guns.',
        pad: 'Press Y to switch guns.',
      },
      hint: 'swap',
      arrow: false,
      enter: (T) => {
        T.mark = P(T).wi;
      },
      update: (T) => P(T).wi !== T.mark,
      praise: null,
    },
    {
      id: 'shotgun',
      title: 'THE SHOTGUN',
      text: {
        touch: 'Keep tapping until it says PUMP SHOTGUN: made for crowds.',
        pc: 'Keep pressing until it says PUMP SHOTGUN: made for crowds.',
        pad: 'Keep pressing until it says PUMP SHOTGUN: made for crowds.',
      },
      hint: 'swap',
      arrow: false,
      update: (T) => P(T).weapon.def.id === 'shotgun',
      praise: 'BOOMSTICK!',
    },
    {
      id: 'crowd',
      title: 'A CROWD!',
      text: {
        touch: 'Here they come! Shotgun them as they bunch up. Too close? TAP to shove.',
        pc: 'Here they come! Shotgun them as they bunch up. Too close? SPACE to shove.',
        pad: 'Here they come! Shotgun them as they bunch up. Too close? RB to shove.',
      },
      hint: (T) => (T.closest('crowd') < 90 ? 'tap' : T.closest('crowd') < 420 ? 'fire' : null),
      tag: 'crowd',
      arrow: false,
      count: () => `${7 - T.group('crowd').alive}/7`,
      enter: (T) => {
        let k = 0;
        // From just out of sight, wherever you are (the alley or the yard): no long wait.
        const from = T.spotsAway(S.crowd, 480, 3);
        for (let i = 0; i < 7; i++) {
          const s = from[i % from.length];
          T.later(0.35 * i, () => T.spawn('crowd', s.x + rand(-30, 30), s.y + rand(-30, 30), { alert: true, speed: 0.72 + 0.04 * k++ }), true);
        }
        T.game.announce('HERE THEY COME!', '#ff6b5a', 2);
        T.game.audio.horde(S.crowd[0].x, S.crowd[0].y);
        T.game.stats.hordes++;
      },
      update: (T) => T.pending === 0 && T.group('crowd').alive === 0,
      praise: 'ALLEY CLEARED!',
    },
    {
      id: 'medkit',
      title: 'PATCH UP',
      text: {
        touch: 'Hurt? Walk over a ✚ MEDKIT to heal up.',
        pc: 'Hurt? Walk over a ✚ MEDKIT to heal up.',
        pad: 'Hurt? Walk over a ✚ MEDKIT to heal up.',
      },
      hint: null,
      skip: (T) => P(T).hp >= P(T).maxHp * 0.8,
      ring: (T) => T.nearestKit(),
      label: 'MEDKIT',
      update: (T) => P(T).hp >= P(T).maxHp * 0.8 || !T.nearestKit(),
      praise: 'GOOD AS NEW',
    },
    safeRoomStep('Through the yard: the SAFE ROOM door is open.'),
  ];
}

function lesson3(T) {
  const S = T.spots;
  const witch = () => T.witch;
  return [
    {
      id: 'arrow',
      title: 'THE GOAL',
      text: {
        touch: 'Every run ends in a SAFE ROOM. The green arrow at the screen edge points the way.',
        pc: 'Every run ends in a SAFE ROOM. The green arrow at the screen edge points the way.',
        pad: 'Every run ends in a SAFE ROOM. The green arrow at the screen edge points the way.',
      },
      hint: (T) => (T.idle > 4 ? 'move' : null),
      arrow: 'goal',
      point: 'arrow',
      update: (T) => P(T).x > T.game.world.map.start.x + 420,
      praise: "THAT'S THE WAY",
    },
    {
      id: 'stash',
      title: 'SUPPLIES',
      text: {
        touch: 'Chalk arrows lead to supplies. Up the alley, then stand still on the crate to search it.',
        pc: 'Chalk arrows lead to supplies. Up the alley, then stand still on the crate to search it.',
        pad: 'Chalk arrows lead to supplies. Up the alley, then stand still on the crate to search it.',
      },
      hint: null,
      ring: (T) => (P(T).y > S.alley.y - 120 && Math.abs(P(T).x - S.alley.x) > 60 ? S.alley : { x: S.stash.x, y: S.stash.y, r: 34 }),
      label: 'SUPPLIES',
      update: (T) => T.stashOpened(),
      praise: null, // the stash says what was in it
    },
    {
      id: 'alarm',
      title: 'ALARM CAR',
      text: (T) => {
        if (T.alarmed) {
          return {
            touch: 'You hit the alarm car: everyone heard. Hold them off until it stops!',
            pc: 'You hit the alarm car: everyone heard. Hold them off until it stops!',
            pad: 'You hit the alarm car: everyone heard. Hold them off until it stops!',
          };
        }
        return {
          touch: "An ALARM car (blinking red)! Don't hit it. Wait here: let those two come to you.",
          pc: "An ALARM car (blinking red)! Don't hit it. Wait here: let those two come to you.",
          pad: "An ALARM car (blinking red)! Don't hit it. Wait here: let those two come to you.",
        };
      },
      hint: null,
      tag: 'biters',
      ring: (T) => (T.alarmed || T.group('biters').list.some((z) => z.alive && z.state !== 'idle') ? null : S.alarmNear),
      label: 'WAIT HERE',
      point: 'alarm',
      count: () => (T.alarmed ? null : `${2 - T.group('biters').alive}/2`),
      enter: (T) => {
        // They stand where they are (no drifting over to the car) until they see you.
        for (const s of S.biters) T.spawn('biters', s.x, s.y, { alert: false, speed: 0.7, still: true });
      },
      update: (T) => {
        const car = S.alarm;
        // At the ring (or close to them anyway): they've seen you, here they come.
        const g = T.group('biters');
        if (!T.woke && (T.at({ ...S.alarmNear, r: S.alarmNear.r + 30 }) || T.closest('biters') < 300)) {
          T.woke = true;
          g.list.forEach((z, i) => z.alive && alertZombie(T.game, z, 0.3 + i * 0.5, false));
        }
        if (!T.alarmed && (car.alarmOn || car.alarmDone)) {
          T.alarmed = true;
          T.restartText();
        }
        if (T.group('biters').alive > 0 || T.group('alarm').alive > 0 || T.pending > 0) return false;
        return !car.alarmOn;
      },
      praise: (T) => (T.alarmed ? 'SURVIVED. NOW YOU KNOW.' : 'QUIET AND CLEAN!'),
    },
    {
      id: 'witch',
      title: 'THE WITCH',
      text: (T) => {
        const w = witch();
        if (w && w.alive && w.mode !== 'sit' && w.mode !== 'flee') {
          return {
            touch: "She's up! SHOOT HER! Don't stop shooting!",
            pc: "She's up! SHOOT HER! Don't stop shooting!",
            pad: "She's up! SHOOT HER! Don't stop shooting!",
          };
        }
        return {
          touch: 'Hear crying? A WITCH. Leave her be: keep away, don\'t aim at her. Go up the LEFT side.',
          pc: 'Hear crying? A WITCH. Leave her be: keep away, don\'t aim at her. Go up the LEFT side.',
          pad: 'Hear crying? A WITCH. Leave her be: keep away, don\'t aim at her. Go up the LEFT side.',
        };
      },
      hint: null,
      ring: (T) => (T.startled ? null : S.pastWitch),
      label: 'GO ROUND',
      point: 'witch',
      update: (T) => {
        const w = witch();
        if (!w) return T.at(S.pastWitch);
        if (!T.startled && w.mode !== 'sit') {
          T.startled = true;
          T.restartText();
        }
        if (T.startled) return !w.alive || w.mode === 'flee';
        return T.at(S.pastWitch);
      },
      praise: (T) => (T.startled ? 'PHEW. NOW YOU KNOW WHY.' : 'SHE NEVER KNEW.'),
    },
    {
      id: 'horde',
      title: 'HORDE!',
      text: {
        touch: 'A horde! Hold your ground: shoot, and TAP to shove any that reach you.',
        pc: 'A horde! Hold your ground: shoot, and SPACE to shove any that reach you.',
        pad: 'A horde! Hold your ground: shoot, and RB to shove any that reach you.',
      },
      hint: (T) => (T.closest('horde') < 80 ? 'tap' : null),
      tag: 'horde',
      arrow: false,
      count: () => `${12 - T.group('horde').alive - T.pending}/12`,
      enter: (T) => {
        for (let i = 0; i < 12; i++) {
          const s = S.horde[i % S.horde.length];
          T.later(0.25 * i, () => T.spawn('horde', s.x + rand(-40, 40), s.y + rand(-40, 40), { alert: true, speed: 0.78 + rand(0, 0.12) }), true);
        }
        T.game.announce('HERE THEY COME!', '#ff6b5a', 2.2);
        T.game.audio.horde(S.horde[0].x, S.horde[0].y);
        T.game.stats.hordes++;
      },
      update: (T) => T.pending === 0 && T.group('horde').alive === 0,
      praise: 'HORDE DOWN!',
    },
    safeRoomStep('The way is clear. Run for the SAFE ROOM!'),
  ];
}

function safeRoomStep(say) {
  return {
    id: 'saferoom',
    title: 'SAFE ROOM',
    text: { touch: say, pc: say, pad: say },
    hint: (T) => (T.idle > 4 ? 'move' : null),
    arrow: 'goal',
    ringGoal: true,
    label: 'SAFE ROOM',
    enter: (T) => T.openGate(),
    update: (T) => T.game.won,
    praise: null,
  };
}

const SCRIPTS = [null, lesson1, lesson2, lesson3];

// --- Run time ---------------------------------------------------------------------------------

export class Tutorial {
  constructor(game, lesson) {
    this.game = game;
    this.lesson = lesson;
    this.spots = game.world.map.tutorial;
    this.groups = new Map(); // tag -> zombies spawned for it
    this.timers = []; // [{ t, fn }] spawns spread over a moment
    this.slowMo = 1; // what the step wants (1 = normal speed)
    this.timeScale = 1; // eased toward slowMo
    this.source = 'touch';
    this.idle = 0; // seconds without moving
    this.finished = false;
    this.alarmed = false;
    this.startled = false;
    this.witch = null;
    this.woke = false; // lesson 3: the two by the alarm car have seen you
    this.lowWarned = false;
    this.textT = 0; // seconds since the step's text last changed (the coach panel animates in)
    this.steps = SCRIPTS[lesson](this);
    if (this.spots.witch) this.witch = this.seatWitch(this.spots.witch);
    this.i = -1;
    this.next();
  }

  get step() {
    return this.steps[this.i] || null;
  }

  /** Zombies queued to arrive in a moment (a step isn't over while some are still on their way). */
  get pending() {
    let n = 0;
    for (const t of this.timers) if (t.spawn) n++;
    return n;
  }

  /** Step number and count for the progress dots (the safe room counts). */
  get progress() {
    return { i: Math.min(this.i, this.steps.length - 1), n: this.steps.length };
  }

  next() {
    for (;;) {
      this.i++;
      const s = this.step;
      if (!s) {
        this.finished = true;
        return;
      }
      this.stepT = 0;
      this.held = 0;
      this.seqI = 0;
      this.mark = null;
      this.restartText();
      if (s.skip && s.skip(this)) continue;
      if (s.enter) s.enter(this);
      return;
    }
  }

  restartText() {
    this.textT = 0;
  }

  /** The step's words for the input being used. */
  text() {
    const s = this.step;
    if (!s) return '';
    const t = typeof s.text === 'function' ? s.text(this) : s.text;
    const src = this.source === 'touch' ? 'touch' : this.source === 'gamepad' ? 'pad' : 'pc';
    return t[src] || t.touch;
  }

  /** The gesture to act out (touch only). */
  hint() {
    const s = this.step;
    if (!s || this.finished) return null;
    return typeof s.hint === 'function' ? s.hint(this) : s.hint;
  }

  count() {
    const s = this.step;
    return s && s.count ? s.count(this) : null;
  }

  /** The ring on the ground: {x, y, r} or null. */
  ring() {
    const s = this.step;
    if (!s || this.finished) return null;
    if (s.ringGoal) {
      const er = this.game.world.map.endRoom.interior;
      return { x: er.x + er.w / 2, y: er.y + er.h / 2, r: 60 };
    }
    if (s.seq) return s.seq[this.seqI] || null;
    return typeof s.ring === 'function' ? s.ring(this) : s.ring || null;
  }

  /**
   * Where the edge arrow points: { x, y, label } (the safe room uses the game's own
   * arrow), or null for none.
   */
  arrow() {
    const s = this.step;
    if (!s || this.finished) return null;
    if (s.arrow === 'goal') return 'goal';
    if (s.arrow === false) return null;
    const r = this.ring();
    return r ? { x: r.x, y: r.y, label: s.label || 'GO' } : null;
  }

  /** The label over the step's zombies (the HUD draws it). */
  tagLabel() {
    const s = this.step;
    if (!s || !s.tag) return null;
    return (typeof s.tagLabel === 'function' ? s.tagLabel(this) : s.tagLabel) || null;
  }

  /** Called from Game.update after everything moved. */
  update(dt, input) {
    const g = this.game;
    const p = g.player;
    if (input && input.source) this.source = input.source;
    this.textT += dt;
    const moving = Math.hypot(p.vx, p.vy) > 30;
    this.idle = moving ? 0 : this.idle + dt;

    for (let k = this.timers.length - 1; k >= 0; k--) {
      const tm = this.timers[k];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(k, 1);
        tm.fn();
      }
    }

    // Slow motion: eased in and out (real time, so it doesn't slow itself down).
    const real = dt / Math.max(0.05, this.timeScale);
    this.timeScale += (this.slowMo - this.timeScale) * dampFactor(this.slowMo < this.timeScale ? 9 : 6, real);
    if (Math.abs(this.timeScale - this.slowMo) < 0.01) this.timeScale = this.slowMo;

    // You can be hurt, not killed (the health floor is in Game.hurtPlayer); low, you're told what to do.
    if (p.alive && p.hp <= HP_FLOOR + 10 && !this.lowWarned) {
      this.lowWarned = true;
      g.announce('LOW HEALTH: BACK OFF AND SHOVE', '#ff8a7a', 2.6, 'small');
    }
    if (p.hp > 50) this.lowWarned = false;

    if (this.finished) {
      this.slowMo = 1;
      return;
    }
    const s = this.step;
    this.stepT += dt;
    if (s.tag && this.stepT > 20) this.dropStragglers(s.tag);
    if (s.update(this, dt, input)) this.complete();
  }

  /**
   * A step's zombie that is still far off and out of sight long after it should
   * have reached you (caught on something) is let go, so "get them all" always ends.
   */
  dropStragglers(tag) {
    const g = this.game;
    const p = g.player;
    for (const z of this.groups.get(tag) || []) {
      if (!z.alive || g.onScreen(z.x, z.y, 80)) continue;
      if (Math.hypot(z.x - p.x, z.y - p.y) > 650) z.alive = false;
    }
  }

  complete() {
    const s = this.step;
    const praise = typeof s.praise === 'function' ? s.praise(this) : s.praise;
    this.slowMo = 1;
    if (praise) {
      this.game.announce(praise, '#7dffa1', 1.3);
      this.game.audio.tutorialStep();
      this.game.haptic(18);
    }
    this.next();
    if (this.finished) this.slowMo = 1;
  }

  // --- Helpers the steps use ------------------------------------------------------------------

  /** Is the survivor inside this ring? */
  at(spot) {
    const p = this.game.player;
    return !!spot && Math.hypot(p.x - spot.x, p.y - spot.y) < spot.r;
  }

  /** Walk the step's rings in order; true once the last is reached. */
  walkSeq() {
    const s = this.step;
    while (this.seqI < s.seq.length && this.at(s.seq[this.seqI])) {
      this.seqI++;
      if (this.seqI < s.seq.length) {
        this.game.audio.pickup();
        this.game.haptic(10);
      }
    }
    return this.seqI >= s.seq.length;
  }

  /** Run fn after t seconds of game time (spawn: it sends a zombie, see pending). */
  later(t, fn, spawn = false) {
    this.timers.push({ t, fn, spawn });
  }

  /** A zombie for a step: tagged, with its own speed (a share of the normal one); still: no wandering off while idle. */
  spawn(tag, x, y, { alert = true, speed = 1, still = false } = {}) {
    const g = this.game;
    const W = g.world;
    const { startRoom, endRoom } = W.map;
    // Free ground, and never inside a safe room (one shut in behind the end room's gate would never come out).
    const ok = (px, py) => W.isFree(px, py, 12) && !pointInRect(px, py, endRoom.outer, 16) && !pointInRect(px, py, startRoom.outer, 16);
    let zx = x;
    let zy = y;
    if (!ok(zx, zy)) {
      let found = false;
      for (let k = 0; k < 96 && !found; k++) {
        const a = (k / 12) * Math.PI * 2;
        const r = 24 + Math.floor(k / 12) * 24;
        if (ok(x + Math.cos(a) * r, y + Math.sin(a) * r)) {
          zx = x + Math.cos(a) * r;
          zy = y + Math.sin(a) * r;
          found = true;
        }
      }
      if (!found) return null; // nowhere to stand: better none than one stuck in a wall
    }
    const z = new Zombie(zx, zy, alert);
    z.speed *= speed;
    if (still) z.walk = 0;
    z.tut = tag;
    g.zombies.push(z);
    if (!this.groups.has(tag)) this.groups.set(tag, []);
    this.groups.get(tag).push(z);
    return z;
  }

  /**
   * Up to n of these spots to send zombies from: off the screen, at least minD away,
   * nearest first (so they're on you soon, but never pop up in view).
   */
  spotsAway(list, minD, n) {
    const g = this.game;
    const p = g.player;
    const far = list.filter((q) => !g.onScreen(q.x, q.y, 70) && Math.hypot(q.x - p.x, q.y - p.y) >= minD);
    const pool = far.length ? far : list;
    return pool.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, n);
  }

  /** One more for a tag, on the way between you and where it first came from, `dist` away. */
  spawnAhead(tag, dist, opts) {
    const g = this.game;
    const p = g.player;
    const from = (this.spots[tag] && this.spots[tag][0]) || { x: p.x + dist, y: p.y };
    const dx = from.x - p.x;
    const dy = from.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, dist / d);
    return this.spawn(tag, p.x + dx * k, p.y + dy * k, { alert: true, ...opts });
  }

  /** { alive, list } of the zombies spawned for a tag. */
  group(tag) {
    const list = this.groups.get(tag) || [];
    let alive = 0;
    for (const z of list) if (z.alive) alive++;
    return { alive, list };
  }

  /** Distance from you to the nearest live zombie of a tag (Infinity if none). */
  closest(tag) {
    const p = this.game.player;
    let best = Infinity;
    for (const z of this.groups.get(tag) || []) if (z.alive) best = Math.min(best, Math.hypot(z.x - p.x, z.y - p.y));
    return best;
  }

  /** The nearest live zombie of a tag (for labels). */
  nearest(tag) {
    const p = this.game.player;
    let best = null;
    let bd = Infinity;
    for (const z of this.groups.get(tag) || []) {
      if (!z.alive) continue;
      const d = Math.hypot(z.x - p.x, z.y - p.y);
      if (d < bd) {
        bd = d;
        best = z;
      }
    }
    return best;
  }

  /** Is the aim (laser) on a live zombie of this tag? */
  aimingAt(tag) {
    const p = this.game.player;
    if (!p.aimActive) return false;
    if (p.assist && p.assist.tut === tag) return true;
    for (const z of this.groups.get(tag) || []) {
      if (!z.alive) continue;
      const dx = z.x - p.x;
      const dy = z.y - p.y;
      const d = Math.hypot(dx, dy);
      const off = Math.abs(Math.sin(p.fireAngle - Math.atan2(dy, dx))) * d;
      if (off < z.r + 6 && Math.cos(p.fireAngle - Math.atan2(dy, dx)) > 0) return true;
    }
    return false;
  }

  stashOpened() {
    const L = this.game.loot;
    return !!(L && L.stashes.length && L.stashes.every((s) => s.opened));
  }

  nearestKit() {
    const p = this.game.player;
    let best = null;
    let bd = Infinity;
    for (const k of this.game.pickups) {
      if (k.taken || k.kind !== 'medkit') continue;
      if (pointInRect(k.x, k.y, this.game.world.map.startRoom.outer)) continue;
      const d = Math.hypot(k.x - p.x, k.y - p.y);
      if (d < bd) {
        bd = d;
        best = { x: k.x, y: k.y, r: 30 };
      }
    }
    return best;
  }

  announceSmall(text, color) {
    this.game.announce(text, color, 2.2, 'small');
  }

  /** A gate slides open: the end room's (the lesson's last step), or the one given. */
  openGate(g = this.spots.gate) {
    if (!g || g.opening) return;
    g.opening = true;
    g.y0 = g.y;
    g.h0 = g.h;
    g.f = 0;
    this.game.audio.switchOn();
    if (g.kind === 'sandbag') {
      // Pulled aside: a puff of grit as the bags come down.
      const fx = this.game.effects;
      for (let k = 0; k < 4; k++) fx.smoke(g.x + g.w / 2, g.y + (g.h * (k + 0.5)) / 4, 12, 10);
      fx.debris(g.x + g.w / 2, g.y + g.h / 2, 10, ['#7d7052', '#968762', '#5e5440']);
    }
    const tick = () => {
      g.f = Math.min(1, g.f + 1 / 30);
      g.y = g.y0 + g.h0 * g.f;
      g.h = g.h0 * (1 - g.f);
      if (g.f < 1) this.later(1 / 60, tick);
      else {
        this.game.world.removeObstacle(g);
        this.game.audio.gateOpen(g.x, g.y0 + g.h0 / 2);
      }
    };
    this.later(0.25, tick);
  }

  /** Lesson 3's Witch: sat where the map says, and easier to put down than the real thing. */
  seatWitch(spot) {
    const g = this.game;
    const w = new Witch(spot.x, spot.y, spot.face || 0, WITCH_HP);
    if (g.goalField) w.goalD = g.goalField.pathDist(spot.x, spot.y);
    g.zombies.push(w);
    g.witches.push(w);
    return w;
  }

  /** player.shove() reports what it hit. */
  onShove(list) {
    const s = this.step;
    if (s && s.onShove) s.onShove(this, list);
  }

  /** The alarm went off in a lesson: three small waves from spots out of sight instead of mobs. */
  alarmWave(wave) {
    const g = this.game;
    const spots = (this.spots.alarmWaves || []).filter((q) => !g.onScreen(q.x, q.y, 60));
    const pool = spots.length ? spots : this.spots.alarmWaves || [];
    if (!pool.length) return;
    const n = wave === 0 ? 5 : 4;
    for (let i = 0; i < n; i++) {
      const q = pool[(i + wave) % pool.length];
      this.later(0.3 * i, () => this.spawn('alarm', q.x + rand(-30, 30), q.y + rand(-30, 30), { alert: true, speed: 0.75 }), true);
    }
    if (wave === 0) g.announce('PANIC! HOLD ON!', '#ff6b5a', 2.2);
    g.stats.hordes++;
  }

  /** The safe room only counts once the lesson has got to it (its gate keeps you out before). */
  get canFinish() {
    return this.finished || (this.step && this.step.id === 'saferoom');
  }
}
