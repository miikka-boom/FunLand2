// The Witch. She sits where she stopped, bent over the light of a phone,
// crying, and all she asks is to be left alone.
//
//  - Calm, she is no threat: aim assist, the teammate and the threat arrows
//    pass her over. You hear her before you see her (sobbing, a slow tune
//    she hums), and the phone lights her up in the dark.
//  - What wears her patience down: you inside her space (the nearer, the
//    faster; a wall between you doesn't count), your flashlight on her at
//    night, shots fired right next to her. The ring around her closes as it
//    runs out. Back off and look away, and it opens again.
//  - What ends it at once: any damage (a stray bullet, a blast, a shove).
//    She is on her feet with a scream and after whoever did it: much faster
//    than you can run, and hard to put down. A shove as she comes in buys a
//    moment, once.
//  - Caught still sitting, from arm's length, what hits her in that instant
//    counts many times over: a shotgun at point blank ends it before it
//    starts.

import { rand, wrapAngle, clamp, smoothstep, pointInRect } from '../util.js';
import { newId } from './zombies.js';
import { flashlightOn } from './terror.js';
import { WITCH_SPACE } from '../world/witch-gen.js';

export const WITCH = {
  hp: 900,
  r: 11,
  near: 62, // this close and she is up within a second
  far: WITCH_SPACE, // her space (170): inside it she minds you, more the nearer you are
  nearTime: 0.8, // seconds at `near` until she's up
  lightTime: 2.2, // seconds of your beam full on her, close by, until she's up
  lightRange: 300, // further off than this your light doesn't trouble her (she'd be off your screen)
  shotRange: 200, // a shot fired this close makes her flinch
  shotJolt: 0.075, // how much of her patience an SMG round next to her costs
  calmAfter: 1.1, // seconds of peace before she starts to settle
  calmTime: 7, // seconds from the brink back to calm
  rise: 0.95, // on her feet, screaming: the time you have
  speed: 285, // you run at 190
  swing: 0.16, // from in reach to the first swipe
  hit: 45, // the first swipe
  claw: 18, // the ones after
  clawEvery: 0.42,
  reach: 9,
  crown: 6, // x damage for what hits her in the instant she is caught sitting...
  crownRange: 120, // ...from this close
  crownWindow: 0.06,
  stumble: 0.45, // a shove as she comes in buys this much...
  stumbleEvery: 2.4, // ...this often
  giveUp: 22, // seconds without landing a swipe before she runs off
  hear: 640, // the first you know of her
  glow: 0.44, // the phone: how much darkness it lifts...
  glowR: 92, // ...and how far
  screenOff: 16, // seconds a dropped phone stays lit
};

/** The tune she hums, over and over (semitones above A4; null = a breath). */
export const WITCH_TUNE = [7, 3, 5, 0, null, 3, 2, -2, 0, null, null];

const tmp = { x: 0, y: 0 };
const patience = (game) => Math.max(0.2, game.settings.witchPatience === undefined ? 1 : game.settings.witchPatience);

export class Witch {
  constructor(x, y, face = 0, hpMul = 1) {
    this.id = newId();
    this.type = 'witch';
    this.mass = 40; // seated: a crowd flows round her
    this.knockScale = 0;
    this.staggerable = false; // she has her own stumble
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.vx = 0;
    this.vy = 0;
    this.r = WITCH.r;
    this.hp = Math.round(WITCH.hp * hpMul);
    this.maxHp = this.hp;
    this.alive = true;
    this.state = 'chase'; // never one of the idle pack (a shot nearby doesn't "alert" her)
    this.alertDelay = 0;
    this.stagger = 0;
    this.mode = 'sit'; // sit | rise | charge | attack | stumble | flee
    this.modeT = 0;
    this.passive = true; // seated: aim assist, the teammate and the threat arrows leave her be
    this.anger = 0; // 0..1: at 1 she is up
    this.calmT = 0;
    this.flinch = 0;
    this.target = null; // who startled her
    this.face = face;
    this.look = 0; // how far her head has come up (0..1, eased)
    this.hitFlash = 0;
    this.anim = rand(0, 10);
    this.skin = '#b9b3c2';
    this.shirt = '#cfc7dd'; // the nightgown
    this.seat = { x, y }; // where she sat (and where the phone stays)
    this.glow = WITCH.glow;
    this.glowR = WITCH.glowR;
    this.phoneT = 0; // seconds since she dropped it
    this.phoneX = x;
    this.phoneY = y;
    this.phoneA = 0;
    this.losT = 0;
    this.sees = false;
    this.hasLOS = false;
    this.sobT = rand(0.2, 1.2);
    this.tuneT = rand(0.5, 2);
    this.tuneI = 0;
    this.growlT = 0;
    this.windup = 0; // the swipe in progress
    this.attackCd = 0;
    this.swipes = 0;
    this.arm = 1;
    this.chaseT = 0;
    this.stumbleCd = 0;
    this.crownT = -1; // game time until which she counts as caught sitting
    this.scream = false;
    this.heard = false;
    this.warned = false;
    this.spared = false;
    this.goalD = Infinity; // her walking distance from the goal (set at spawn)
    this.noCollide = false;
  }

  /** Something loud right next to her (a shot): she flinches. */
  hear(game, x, y, radius) {
    if (this.mode !== 'sit' || !this.alive) return;
    // The teammate's gun doesn't count: you can't tell it where to stand.
    const a = game.ally;
    if (a && a.alive && Math.hypot(x - a.x, y - a.y) < 2 && Math.hypot(x - game.player.x, y - game.player.y) > 2) return;
    const d = Math.hypot(x - this.x, y - this.y);
    if (d >= WITCH.shotRange) return;
    const loud = clamp(radius / 520, 0.5, 1.8);
    this.anger += (WITCH.shotJolt * loud * (1 - d / WITCH.shotRange)) / patience(game);
    this.calmT = WITCH.calmAfter;
    this.flinch = 0.22;
  }

  onHit(game, dmg, stagger, dx = 0, dy = 0) {
    if (this.mode === 'sit') {
      const byAlly = game.killCredit === 'ally' && game.ally && game.ally.alive && !game.ally.down;
      const who = byAlly ? game.ally : game.player;
      // Caught sitting, from arm's length: this hit, and whatever lands with it, counts many times over.
      if (Math.hypot(who.x - this.x, who.y - this.y) <= WITCH.crownRange) {
        this.crownT = game.time + WITCH.crownWindow;
        this.hp -= dmg * (WITCH.crown - 1);
      }
      startle(game, this, who);
      return;
    }
    if (game.time <= this.crownT) this.hp -= dmg * (WITCH.crown - 1);
    // A shove as she comes in: she stumbles (once in a while; otherwise she shrugs it off).
    if (stagger >= 0.5 && (this.mode === 'charge' || this.mode === 'attack')) {
      if (this.stumbleCd <= 0) {
        this.mode = 'stumble';
        this.modeT = WITCH.stumble;
        this.stumbleCd = WITCH.stumbleEvery;
        this.windup = 0;
        this.attackCd = WITCH.stumble + 0.1;
        this.vx = dx * 250;
        this.vy = dy * 250;
        game.stats.witchShoves++;
        game.announce('SHOVED HER BACK', '#9fd8ff', 1, 'small');
        game.audio.deadstop();
      } else this.attackCd = Math.min(this.attackCd, 0.18);
    }
  }

  onDeath(game) {
    game.stats.witches++;
    this.passive = false;
    if (game.time <= this.crownT) {
      game.stats.crowns++;
      game.announce('GOOD NIGHT.', '#ffd36b', 2.2);
    } else game.announce('WITCH DOWN', '#ffd36b', 2);
    dropPhone(this); // it lies where it fell
    game.audio.witchDie(this.x, this.y);
    game.addTrauma(0.25);
  }
}

function dropPhone(w) {
  if (w.phoneT > 0) return;
  w.phoneT = 1e-3;
  // It lands where her hands were, screen up.
  w.phoneX = w.seat.x + Math.cos(w.face) * 13;
  w.phoneY = w.seat.y + Math.sin(w.face) * 13;
  w.phoneA = w.face + 0.7;
}

/** She is up: a scream, a moment on her feet, then she comes for `who`. */
export function startle(game, w, who) {
  if (w.mode !== 'sit') return;
  const p = game.player;
  const a = game.ally;
  w.target = who === a && a && a.alive && !a.down ? a : p;
  w.mode = 'rise';
  w.modeT = WITCH.rise;
  w.passive = false;
  w.anger = 1;
  w.mass = 3; // on her feet she shoulders through a crowd
  w.knockScale = 0.12;
  w.chaseT = 0;
  w.scream = true; // on her next breath (a blast that kills her where she sits cuts it off)
  dropPhone(w);
  game.stats.witchStartled++;
}

function startFlee(game, w, quiet = false) {
  w.mode = 'flee';
  w.modeT = 9;
  w.windup = 0;
  w.passive = false;
  if (quiet) return;
  game.stats.witchFled++;
  game.audio.witchScream(w.x, w.y, 0.6);
  game.announce('THE WITCH RAN OFF', '#cdbfe6', 1.8, 'small');
}

function swipe(game, w, t) {
  const S = game.settings;
  const first = w.swipes === 0;
  const dmg = (first ? WITCH.hit : WITCH.claw) * S.zombieDamage;
  if (t === game.player) game.hurtPlayer(dmg, w, { knock: first ? 260 : 70, knockT: first ? 0.2 : 0, slow: 0.55 });
  else game.hurtAlly(dmg, w, { knock: first ? 220 : 60 });
  w.swipes++;
  w.arm = -w.arm;
  w.chaseT = 0;
  game.stats.witchHits++;
  game.audio.witchSlash(first);
  game.addTrauma(first ? 0.4 : 0.14);
  game.haptic(first ? 70 : 30);
}

export function updateWitch(game, w, dt) {
  const p = game.player;
  const S = game.settings;
  const W = game.world;
  w.hitFlash -= dt;
  w.anim += dt;
  w.flinch -= dt;
  w.stumbleCd -= dt;
  w.attackCd -= dt;
  w.px = w.x;
  w.py = w.y;

  const dx = p.x - w.x;
  const dy = p.y - w.y;
  const d = Math.hypot(dx, dy) || 1e-6;

  if (w.mode === 'sit') {
    // Nothing moves her.
    w.x = w.seat.x;
    w.y = w.seat.y;
    w.vx = 0;
    w.vy = 0;
    let bother = 0; // of her patience, per second
    if (p.alive && !game.won) {
      if (d < WITCH.far) {
        w.losT -= dt;
        if (w.losT <= 0) {
          w.losT = 0.15;
          w.sees = d < 40 || W.segmentClear(w.x, w.y, p.x, p.y);
        }
        if (w.sees) {
          const k = clamp((WITCH.far - d) / (WITCH.far - WITCH.near), 0, 1);
          bother += (k * k) / WITCH.nearTime;
        }
      }
      const c = d < WITCH.lightRange ? flashlightOn(game, w.x, w.y) : 0;
      if (c > 0.05) bother += (c * (0.45 + 0.55 * (1 - d / WITCH.lightRange))) / WITCH.lightTime;
    }
    if (bother > 0) {
      w.anger += (bother * dt) / patience(game);
      w.calmT = WITCH.calmAfter;
    } else {
      w.calmT -= dt;
      if (w.calmT <= 0) w.anger = Math.max(0, w.anger - dt / WITCH.calmTime);
    }
    if (w.anger >= 1) {
      startle(game, w, p);
      return;
    }
    const up = smoothstep(0.2, 0.85, w.anger);
    w.look += (up - w.look) * Math.min(1, dt * 6);
    // Her head comes round to you as it comes up.
    if (up > 0.05 && p.alive) w.face += wrapAngle(Math.atan2(dy, dx) - w.face) * Math.min(1, dt * 2.2 * up);

    // What you hear of her: sobbing and the tune while she's lost in it, a growl once she isn't.
    if (!w.heard && p.alive && d < WITCH.hear) {
      w.heard = true;
      game.announce('SOMEONE IS CRYING', '#cdbfe6', 2.4, 'small');
    }
    if (!w.warned && w.anger > 0.18) {
      w.warned = true;
      game.announce(S.night ? 'SHE HEARD YOU: BACK OFF, LIGHT OFF HER' : 'SHE HEARD YOU: BACK OFF', '#ff9d7a', 2.8, 'small');
    }
    w.sobT -= dt;
    if (w.sobT <= 0) {
      w.sobT = rand(1.5, 2.7);
      if (w.anger < 0.45) game.audio.witchSob(w.x, w.y);
    }
    w.tuneT -= dt;
    if (w.tuneT <= 0) {
      w.tuneT = 0.62;
      const note = WITCH_TUNE[w.tuneI++ % WITCH_TUNE.length];
      if (note !== null && w.anger < 0.25 && d < 760) game.audio.witchNote(w.x, w.y, note);
    }
    if (w.anger > 0.3) {
      w.growlT -= dt;
      if (w.growlT <= 0) {
        w.growlT = 0.95 - 0.55 * w.anger;
        game.audio.witchGrowl(w.x, w.y, w.anger);
      }
    }
    // Left in peace: you are well past her and she never looked up.
    if (!w.spared && w.heard && p.alive && d > 420 && Number.isFinite(w.goalD) && game.goalDist < w.goalD - 460) {
      w.spared = true;
      game.stats.witchSpared++;
      game.announce('LEFT HER IN PEACE', '#cdbfe6', 1.8, 'small');
    }
    return;
  }

  w.look += (1 - w.look) * Math.min(1, dt * 10);
  const a = game.ally;
  let t = w.target;
  if (t && t !== p && !(a && a.alive && !a.down)) t = null; // the teammate is down: she has what she came for
  let wantX = 0;
  let wantY = 0;
  let steer = 9;

  if (w.scream) {
    w.scream = false;
    game.audio.witchScream(w.x, w.y);
    game.announce(w.target === p ? 'YOU STARTLED THE WITCH' : 'THE WITCH IS UP', '#ff5a4a', 2.2);
    game.addTrauma(0.35);
    game.haptic(90);
    if (game.director) game.director.addIntensity(0.25);
  }

  switch (w.mode) {
    case 'rise': {
      w.vx *= Math.exp(-10 * dt);
      w.vy *= Math.exp(-10 * dt);
      const tt = t || p;
      w.face += wrapAngle(Math.atan2(tt.y - w.y, tt.x - w.x) - w.face) * Math.min(1, dt * 9);
      w.modeT -= dt;
      if (w.modeT <= 0) w.mode = 'charge';
      steer = 0;
      break;
    }
    case 'stumble': {
      steer = 5;
      w.modeT -= dt;
      if (w.modeT <= 0) w.mode = 'charge';
      break;
    }
    case 'charge':
    case 'attack': {
      if (!t || !t.alive || game.won) {
        // The run is over, or the teammate she came for is down: she is gone.
        startFlee(game, w, game.won || !p.alive);
        break;
      }
      w.chaseT += dt;
      if (w.chaseT > WITCH.giveUp) {
        startFlee(game, w);
        break;
      }
      const tx = t.x - w.x;
      const ty = t.y - w.y;
      const td = Math.hypot(tx, ty) || 1e-6;
      w.losT -= dt;
      if (w.losT <= 0) {
        w.losT = 0.14;
        w.hasLOS = td < 700 && W.segmentClear(w.x, w.y, t.x, t.y, W.moveBlockers);
      }
      let mx = tx / td;
      let my = ty / td;
      if (!w.hasLOS && td > 36 && W.flow.dirAt(w.x, w.y, tmp)) {
        mx = tmp.x;
        my = tmp.y;
      }
      const reach = w.r + t.r + WITCH.reach;
      let sp = WITCH.speed * S.zombieSpeed;
      if (td < reach + 4) sp *= 0.3; // on you: press, don't jitter
      wantX = mx * sp;
      wantY = my * sp;
      w.mode = td < reach + 22 ? 'attack' : 'charge';
      if (w.windup > 0) {
        w.windup -= dt;
        if (w.windup <= 0) {
          w.attackCd = WITCH.clawEvery;
          if (td < reach + 12) swipe(game, w, t);
        }
      } else if (td < reach && w.attackCd <= 0) w.windup = w.swipes ? 0.08 : WITCH.swing;
      if (td < 140) w.face += wrapAngle(Math.atan2(ty, tx) - w.face) * Math.min(1, dt * 12);
      break;
    }
    case 'flee': {
      // Away from you, into the dark; gone once she's out of sight.
      let mx = -dx / d;
      let my = -dy / d;
      if (W.flow.dirAt(w.x, w.y, tmp)) {
        mx = -tmp.x * 0.7 + mx * 0.3;
        my = -tmp.y * 0.7 + my * 0.3;
      }
      const l = Math.hypot(mx, my) || 1;
      wantX = (mx / l) * WITCH.speed * S.zombieSpeed;
      wantY = (my / l) * WITCH.speed * S.zombieSpeed;
      w.modeT -= dt;
      if (w.modeT <= 0 || (d > 620 && !game.onScreen(w.x, w.y, 60))) {
        w.alive = false; // gone (not a kill)
        return;
      }
      break;
    }
    default:
      break;
  }

  if (steer > 0) {
    const k = 1 - Math.exp(-steer * dt);
    w.vx += (wantX - w.vx) * k;
    w.vy += (wantY - w.vy) * k;
  }
  w.x += w.vx * dt;
  w.y += w.vy * dt;
  W.collide(w, w.r);
  if ((w.mode === 'charge' || w.mode === 'flee') && w.vx * w.vx + w.vy * w.vy > 400) {
    w.face += wrapAngle(Math.atan2(w.vy, w.vx) - w.face) * Math.min(1, dt * 10);
  }
}

/**
 * The phones, every frame, whether their owners live or not: in her hands the
 * screen flickers; dropped, it stays lit for a while, then times out.
 */
export function updatePhones(game, dt) {
  for (const w of game.witches) {
    if (w.phoneT > 0) {
      w.phoneT += dt;
      w.glow = WITCH.glow * 0.8 * clamp((WITCH.screenOff - w.phoneT) / 2.5, 0, 1);
    } else w.glow = WITCH.glow * (0.9 + 0.1 * Math.sin(game.time * 9.1 + w.id) * Math.sin(game.time * 2.3));
  }
}

/**
 * Tuning panel: seat one a little way off, ahead of you if there is room
 * (outside her space and your light, so you get to walk up to her).
 */
export function seatWitchNear(game) {
  const p = game.player;
  const W = game.world;
  const map = W.map;
  // Somewhere you can walk straight up to, if there is such a place; anywhere you can reach, if not.
  for (const straight of [true, false]) {
    for (const dist of [330, 380, 290, 440]) {
      for (let k = 0; k < 24; k++) {
        const a = p.facing + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.262;
        const x = p.x + Math.cos(a) * dist;
        const y = p.y + Math.sin(a) * dist;
        if (!W.isFree(x, y, 26) || W.sealedAt(x, y) || !Number.isFinite(W.flow.pathDist(x, y))) continue;
        if (pointInRect(x, y, map.startRoom.outer, 40) || pointInRect(x, y, map.endRoom.outer, 40)) continue;
        if (straight && !W.segmentClear(p.x, p.y, x, y, W.moveBlockers)) continue;
        const w = spawnWitch(game, { x, y, face: a + Math.PI + rand(-1, 1) });
        game.announce('A WITCH SITS NEARBY', '#cdbfe6', 1.8, 'small');
        return w;
      }
    }
  }
  game.announce('No room for a Witch here', '#ffd27a', 1.8, 'small');
  return null;
}

/**
 * How it went with the Witch this run: null (there was none) | 'unheard' |
 * 'crying' (you heard her and that was all) | 'spared' (passed her, never
 * looked up) | 'startled' | 'killed' | 'crowned' (one blast while she sat).
 */
export function witchOutcome(game) {
  const st = game.stats;
  if (!game.witches || !game.witches.length) return null;
  if (st.crowns) return 'crowned';
  if (st.witches) return 'killed';
  if (st.witchStartled) return 'startled';
  if (st.witchSpared) return 'spared';
  return game.witches.some((w) => w.heard) ? 'crying' : 'unheard';
}

/** Seat a Witch at a spot the map pass chose ({x, y, face}). */
export function spawnWitch(game, spot) {
  const w = new Witch(spot.x, spot.y, spot.face || 0, game.settings.witchHealth === undefined ? 1 : game.settings.witchHealth);
  if (game.goalField) w.goalD = game.goalField.pathDist(spot.x, spot.y);
  game.zombies.push(w);
  game.witches.push(w);
  return w;
}
