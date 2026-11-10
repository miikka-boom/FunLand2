// Spells: cards that are cast anywhere on the field instead of dropping units.
//
// Each spell is a little entity in battle.spells ({ kind, team, x, y, t, ... },
// drawn by render/spells.js) that lives for a moment, does its thing to enemy
// beans and towers, and removes itself. They are physical: the Boulder sends
// beans flying, the Arrow Rain fires real arrows that stick (pincushions), the
// Cheese Wheel bowls beans over as it rolls past.
//
// The newer five: Banana Peels leave real peel items on the ground that trip
// whoever steps on one (8 s), Big Sneeze blows a crowd back, Shaken Soda fizzes
// for a moment and then shoots everything on top straight up, the Anvil drops
// on one spot, and Bubble Wrap wraps your own beans.
//
// Spells only hurt the other team (Bubble Wrap only helps your own). Towers and
// buildings take their share of spell damage (takesOf in towers.js).
// Every number here is gameplay: the balance tests tune these constants.

import { WORLD } from '../config.js';
import { levelMul } from './cards.js';
import { Particle, Dist } from './physics.js';
import { takesOf, damageTower, rectDist } from './towers.js';

const G = WORLD.gravity;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const SPELLS = {
  boulder: {
    damage: 95, // knocks a Clubber flat but doesn't finish it (it's the launch that sells it)
    r: 30, // the rock's radius (the card's radius is its reach)
    fall: 0.85, // seconds from the sky to the ground
    from: 240, // starts this far behind the target (on the caster's side)...
    height: 700, // ...and this high up
    launch: [320, 660], // px/s (away, up) right under it, less toward the edge
    stun: 1.0,
    rest: 1.3, // seconds it lies there before fading
  },
  arrowRain: {
    volleys: 3,
    gap: 0.32, // seconds between volleys
    damage: 21, // per volley, to every enemy in the circle (63 in all: Spikers, not Archers, Bombs or Clubbers)
    arrows: 14, // real arrows per volley (they stick; the damage is the volley's)
    fall: 0.6, // seconds from release to the ground
    height: 620,
    stun: 0.3,
  },
  wheel: {
    damage: 40,
    speed: 400, // px/s along the ground toward the enemy
    dist: 320, // how far it rolls (a whole push knocked flat is a lot for one card)
    launch: [200, 340], // bowled over: away and up, cartwheeling
    stun: 1.25, // knocks down even an armoured Squire (not a Brick)
  },
  // The newer five (docs/WOBBLE-WAR-CARDS.md section 4)
  bananaPeels: { peels: 5, toss: 0.4, life: 8, uses: 2, maxSlips: 10, trigger: 9, laneTol: 8, damage: 8, feet: 260, head: 180, hipUp: 160, immune: 1.5, kick: 170, heavyMass: 3, skid: 120, skidWobble: 0.4, minAge: 0.4 },
  bigSneeze: { inhale: 0.4, damage: 20, push: 420, up: 140, falloff: 0.4, stun: 0.3, air: 1.8 },
  shakenSoda: { fuse: 1.2, damage: 50, lift: 900, side: 80, stun: 0.6, airLiftOff: 0.6, erupt: 0.6 },
  anvil: { fall: 0.9, height: 620, damage: 310, shield: 0.4, stun: 1.2, squash: 1.0, carry: 900, liftOff: 1.2, rest: 2.0 },
  bubbleWrap: { time: 8, absorb: 70, stunMul: 0.5, bounce: 0.6 },
};

/** Card spell names -> entity kinds. */
const KIND = {
  boulder: 'boulder',
  arrowRain: 'arrowRain',
  cheeseWheel: 'wheel',
  wheel: 'wheel',
  bananaPeels: 'peels',
  bigSneeze: 'sneeze',
  shakenSoda: 'soda',
  anvil: 'anvil',
  bubbleWrap: 'wrap',
};

// Looks and feel of the newer spells (not balance: the numbers above are)
const PEEL = { toss: 260, len: 12, r: 2, mass: 0.1, friction: 0.5, bounce: 0.15, still: 40, spin: 70, spent: 0.6, stand: 10 };
const SNEEZE_FADE = 0.5; // the cloud blows itself away this long after the inhale...
const SNEEZE_BLOW = 0.3; // ...the blast itself takes this long (state 'blow')
const SODA_FADE = 0.5; // the empty bottle stays this long after the eruption (state 'fade')
const ANVIL_FADE = 0.4; // the resting anvil fades out over the end of its rest
const WRAP_PUFF = 0.5; // the wrap's puff (the wraps themselves last SPELLS.bubbleWrap.time)

/**
 * Cast a spell card at world x for `team`. Returns the spell entity (also in
 * battle.spells), or null for an unknown spell.
 */
export function castSpell(b, card, team, x, level = 1) {
  const kind = KIND[card.spell];
  if (!kind) return null;
  const f = team === 'blue' ? 1 : -1;
  const base = { kind, team, f, t: 0, done: false, level, dmgMul: levelMul(level), radius: card.radius || 60, card: card.id };
  x = clamp(x, 0, WORLD.width);
  let s;
  if (kind === 'boulder') {
    const S = SPELLS.boulder;
    const r = S.r;
    const y0 = -S.height;
    const yEnd = groundY() - r;
    const x0 = x - f * S.from;
    s = { ...base, x: x0, y: y0, r, rot: 0, vx: (x - x0) / S.fall, vy: (yEnd - y0 - 0.5 * G * S.fall * S.fall) / S.fall, state: 'fall', tx: x, restT: 0, alpha: 1 };
  } else if (kind === 'arrowRain') {
    s = { ...base, x, y: groundY(), volley: 0, landed: 0 };
  } else if (kind === 'peels') {
    s = { ...base, x, y: groundY(), slips: 0, peels: [] };
  } else if (kind === 'sneeze') {
    s = { ...base, x, y: groundY(), state: 'inhale' };
  } else if (kind === 'soda') {
    s = { ...base, x, y: groundY(), state: 'fizz', shake: 0 };
  } else if (kind === 'anvil') {
    const S = SPELLS.anvil;
    const r = 18;
    const y0 = -S.height;
    // Straight down, timed to land at t = fall
    s = { ...base, x, y: y0, vx: 0, vy: (groundY() - r - y0 - 0.5 * G * S.fall * S.fall) / S.fall, r, state: 'fall', alpha: 1, restT: 0 };
  } else if (kind === 'wrap') {
    s = { ...base, x, y: groundY() };
  } else {
    const r = card.radius || 40;
    s = { ...base, x, y: groundY() - r, r, rot: 0, vx: f * SPELLS.wheel.speed, dist: 0, hit: new Set() };
  }
  b.spells.push(s);
  b.emit('spellCast', x, s.y, { team, spell: kind, card: card.id, entity: s });
  if (kind === 'peels') tossPeels(b, s);
  else if (kind === 'wrap') wrapUp(b, s);
  return s;
}

/** Per step: move every spell, apply its effects, drop the finished ones. */
export function updateSpells(b, dt) {
  for (let i = b.spells.length - 1; i >= 0; i--) {
    const s = b.spells[i];
    s.t += dt;
    if (s.kind === 'boulder') boulder(b, s, dt);
    else if (s.kind === 'arrowRain') arrowRain(b, s, dt);
    else if (s.kind === 'wheel') wheel(b, s, dt);
    else if (s.kind === 'peels') updatePeels(b, s, dt);
    else if (s.kind === 'sneeze') sneeze(b, s);
    else if (s.kind === 'soda') soda(b, s);
    else if (s.kind === 'anvil') anvil(b, s, dt);
    else if (s.kind === 'wrap') s.done = s.t >= WRAP_PUFF;
    else s.done = true;
    if (s.done) b.spells.splice(i, 1);
  }
}

// The middle of the lanes: where rocks land and wheels roll
const groundY = () => WORLD.groundY + WORLD.laneDepth * 0.5;

// --- Boulder ---------------------------------------------------------------------

function boulder(b, s, dt) {
  const S = SPELLS.boulder;
  const yEnd = groundY() - s.r;
  s.vy += G * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  s.rot += (s.vx / s.r) * dt;
  if (s.state === 'fall') {
    if (s.y < yEnd) return;
    s.y = yEnd;
    s.state = 'rest';
    boulderImpact(b, s);
    // One heavy bounce, then it rolls a little and settles
    s.vy = -Math.abs(s.vy) * 0.18;
    s.vx *= 0.3;
    return;
  }
  if (s.y >= yEnd) {
    s.y = yEnd;
    s.vy = s.vy > 120 ? -s.vy * 0.2 : 0;
    s.vx *= Math.exp(-dt * 3);
  }
  s.restT += dt;
  if (s.restT > S.rest) s.alpha = Math.max(0, s.alpha - dt / 0.4);
  if (s.alpha <= 0) s.done = true;
}

function boulderImpact(b, s) {
  const S = SPELLS.boulder;
  const dt = b.dt;
  const x = s.x;
  const y = s.y;
  const R = s.radius;
  b.emit('boulderImpact', x, y + s.r, { power: 1.4, team: s.team, spell: s });
  for (const e of b.units) {
    if (e.team === s.team || e.gone) continue;
    if (Math.abs(e.hip.x - x) > R + 60) continue;
    let d = Infinity;
    for (const p of e.body) d = Math.min(d, Math.hypot(p.x - x, p.y - y));
    d = Math.max(0, d - e.R);
    if (d > R) continue;
    const k = 1 - d / R;
    const dir = Math.sign(e.hip.x - x) || s.f;
    const live = e.alive ? 1 : 0.7; // corpses go flying too
    e.takeHit(b, {
      damage: e.alive ? S.damage * s.dmgMul : 0,
      dvx: dir * S.launch[0] * (0.45 + 0.55 * k) * live,
      dvy: -S.launch[1] * (0.55 + 0.45 * k) * live,
      x,
      y,
      stun: S.stun,
      kind: 'boulder',
      from: s,
      spin: 0.45,
      flip: 130 * k,
    });
  }
  for (const it of b.items) {
    for (const p of [it.a, it.b]) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < R + 20) p.addVel(Math.sign(p.x - x) * 200, -480, dt);
    }
  }
  for (const t of b.towers) {
    if (t.team === s.team || !t.alive || rectDist(t, x, y) > R) continue;
    damageTower(b, t, S.damage * s.dmgMul * takesOf(t, 'spell'), clamp(x, t.x - t.w / 2, t.x + t.w / 2), clamp(y, -t.h, 0), 'spell', s);
  }
}

// --- Arrow Rain --------------------------------------------------------------------

function arrowRain(b, s, dt) {
  const S = SPELLS.arrowRain;
  while (s.volley < S.volleys && s.t >= s.volley * S.gap) {
    rainVolley(b, s);
    s.volley++;
  }
  while (s.landed < s.volley && s.t >= s.landed * S.gap + S.fall) {
    rainLand(b, s);
    s.landed++;
  }
  if (s.landed >= S.volleys) s.done = true;
}

/** Release one volley: real arrows that drop into the circle as the volley lands. */
function rainVolley(b, s) {
  const S = SPELLS.arrowRain;
  const n = S.arrows;
  const drift = s.f * 70;
  b.emit('rainVolley', s.x, -S.height, { radius: s.radius, team: s.team, spell: s });
  for (let k = 0; k < n; k++) {
    const lx = s.x + ((k + 0.5) / n - 0.5) * 2 * s.radius + (b.rng.next() - 0.5) * (s.radius / n) * 1.6;
    const T = S.fall * b.rng.range(0.95, 1.04);
    const ground = WORLD.groundY + b.rng.next() * WORLD.laneDepth + 3;
    const H = S.height * b.rng.range(0.93, 1.07);
    const vy = (ground + H - 0.5 * G * T * T) / T;
    b.arrows.push({
      x: lx - drift * T,
      y: -H,
      vx: drift,
      vy,
      ang: Math.atan2(vy, drift),
      team: s.team,
      from: null,
      damage: 0, // the volley deals its damage to everyone in the circle at once (fair, not lucky)
      stun: 0.04,
      rain: true,
      state: 'fly',
      ground,
      host: null,
      target: null,
      age: 0,
    });
  }
}

function rainLand(b, s) {
  const S = SPELLS.arrowRain;
  const dt = b.dt;
  for (const e of b.units) {
    if (e.team === s.team || !e.alive || Math.abs(e.hip.x - s.x) > s.radius + e.R * 0.5) continue;
    e.takeHit(b, { damage: S.damage * s.dmgMul, dvx: s.f * 30, dvy: -50, x: e.chest.x, y: e.chest.y - e.R, stun: S.stun, kind: 'arrowRain', from: s, spin: 0.5 });
  }
  for (const t of b.towers) {
    if (t.team === s.team || !t.alive || Math.abs(t.x - s.x) > s.radius + t.w / 2) continue;
    damageTower(b, t, S.damage * s.dmgMul * takesOf(t, 'spell'), clamp(s.x, t.x - t.w / 2, t.x + t.w / 2), -t.h, 'spell', s);
  }
  for (const it of b.items) if (Math.abs((it.a.x + it.b.x) / 2 - s.x) < s.radius) it.b.addVel(0, -60, dt);
}

// --- Cheese Wheel -------------------------------------------------------------------

function wheel(b, s, dt) {
  const S = SPELLS.wheel;
  s.x += s.vx * dt;
  s.dist += Math.abs(s.vx) * dt;
  s.rot += (s.vx / s.r) * dt;
  for (const e of b.units) {
    if (e.team === s.team || e.gone || s.hit.has(e.id)) continue;
    if (Math.abs(e.hip.x - s.x) > s.r + e.R * 0.6) continue;
    if (e.hip.y < s.y - s.r - e.standH - 10) continue; // flying over it
    s.hit.add(e.id);
    const live = e.alive ? 1 : 0.6;
    e.takeHit(b, {
      damage: e.alive ? S.damage * s.dmgMul : 0,
      dvx: s.f * S.launch[0] * live,
      dvy: -S.launch[1] * live,
      x: e.hip.x,
      y: e.ground, // swept off its feet: the kick is at the bottom
      stun: S.stun,
      kind: 'wheel',
      from: s,
      spin: 0.6,
      flip: -170, // feet swept out forward, head tips back: bowled over
    });
    b.emit('wheelHit', e.hip.x, e.hip.y, { unit: e, team: s.team, spell: s });
  }
  for (const t of b.towers) {
    if (t.team === s.team || !t.alive || s.hit.has(t.id)) continue;
    if (Math.abs(t.x - s.x) > t.w / 2 + s.r * 0.5) continue;
    s.hit.add(t.id); // it dents the wall and rolls on past it
    damageTower(b, t, S.damage * s.dmgMul * takesOf(t, 'spell'), s.x, s.y, 'spell', s);
  }
  if (s.dist >= S.dist || s.x < s.r || s.x > WORLD.width - s.r) {
    s.done = true;
    b.emit('wheelEnd', s.x, s.y, { team: s.team, spell: s });
  }
}

// --- Banana Peels ---------------------------------------------------------------------

/**
 * The toss: SPELLS.bananaPeels.peels peel items drop in from PEEL.toss px up,
 * spread evenly across the circle (a little jitter), each on a random lane,
 * landing about `toss` s later. They are real items: blasts, quakes and the
 * Boulder fling them, and a flung peel works again where it lands.
 */
function tossPeels(b, s) {
  const S = SPELLS.bananaPeels;
  const n = S.peels;
  const R = s.radius;
  const vy = (PEEL.toss - 0.5 * G * S.toss * S.toss) / S.toss; // lands at t = toss
  for (let k = 0; k < n; k++) {
    const x = clamp(s.x + ((k + 0.5) / n - 0.5) * 2 * R + (b.rng.next() - 0.5) * (R / n) * 0.8, 12, WORLD.width - 12);
    const laneY = WORLD.groundY + b.rng.next() * WORLD.laneDepth;
    const y = laneY - PEEL.r - PEEL.toss;
    const mk = (px) => {
      const p = new Particle(px, y, PEEL.mass, PEEL.r);
      p.setVel(0, vy, b.dt);
      p.ground = laneY;
      p.friction = PEEL.friction;
      p.bounce = PEEL.bounce;
      return p;
    };
    const a = mk(x - PEEL.len / 2);
    const c = mk(x + PEEL.len / 2);
    const it = { kind: 'peel', team: s.team, a, b: c, con: new Dist(a, c, PEEL.len), age: 0, life: S.life, uses: S.uses, used: false, laneY, dmgMul: s.dmgMul, spell: s };
    b.items.push(it);
    s.peels.push(it);
  }
}

/**
 * The slip check for one cast's peels. A peel is set once it has lain still
 * on the ground (age >= minAge, both ends down, slower than PEEL.still px/s).
 * An enemy walking over it with a planted foot within `trigger` px (a Pogo:
 * its stick landing there), on a lane within laneTol, slips (Unit.slip), and
 * the peel is kicked back the way the bean came: it browns, loses a use, and
 * fades at 0. A cast never trips more than maxSlips beans. Fliers, floaters,
 * held beans and beans that aren't standing never slip.
 */
function updatePeels(b, s, dt) {
  const S = SPELLS.bananaPeels;
  let left = 0;
  for (const it of s.peels) {
    if (it.fade <= 0) continue; // cleared away (reap)
    left++;
    if (it.uses <= 0 || s.slips >= S.maxSlips || it.age < S.minAge || it.age >= it.life) continue;
    const a = it.a;
    const c = it.b;
    if (!a.onGround || !c.onGround) continue;
    if (Math.hypot((a.vx(dt) + c.vx(dt)) / 2, (a.vy(dt) + c.vy(dt)) / 2) > PEEL.still) continue;
    const px = (a.x + c.x) / 2;
    for (const u of b.units) {
      if (u.team === s.team || !u.alive || u.gone || u.held || u.air || u.type.flying || u.floatT > 0) continue;
      if (u.deployT > 0 || u.slipImmuneT > 0 || u.downT > 0 || !standing(u)) continue;
      if (Math.abs(u.hip.x - px) > 40 || Math.abs(u.ground - it.laneY) > S.laneTol) continue;
      let on = false;
      if (u.type.hop) on = u.hopLanded && Math.abs((u.tip ? u.tip.x : u.hip.x) - px) <= S.trigger;
      else for (let i = 0; i < 2; i++) if (u.feet[i].plant && Math.abs(u.foot[i].x - px) <= S.trigger) on = true;
      if (!on) continue;
      const dir = u.f;
      u.slip(b, it);
      s.slips++;
      // Kicked out from under it, spinning, back the way it came
      a.addVel(-dir * S.kick, -120 - PEEL.spin, dt);
      c.addVel(-dir * S.kick, -120 + PEEL.spin, dt);
      it.uses--;
      it.used = true;
      if (it.uses <= 0) it.life = Math.min(it.life, it.age + PEEL.spent); // flies, lands, fades
      b.emit('peelKick', px, it.laneY, {});
      break;
    }
  }
  // Done once every peel has faded away (or long after, if nothing clears items away)
  if (!left || s.t > S.life + 3) s.done = true;
}

/**
 * On its feet: hips at about their standing height (a Pogo on its stick). Not
 * groundF, which a small bean's bouncy walk keeps well under 1 (a Sprout's
 * tops out at about 0.75) and a Big Jelly's sits at 0.55.
 */
function standing(u) {
  return u.type.hop ? u.groundF > 0.8 : Math.abs(u.ground - u.hip.y - u.standH) < PEEL.stand;
}

// --- Big Sneeze ---------------------------------------------------------------------

/** Inhale (visual), then one ACHOO at t = inhale, then the cloud blows itself away. */
function sneeze(b, s) {
  const S = SPELLS.bigSneeze;
  if (s.state === 'inhale') {
    if (s.t < S.inhale) return;
    s.state = 'blow';
    achoo(b, s);
  }
  if (s.state === 'blow' && s.t >= S.inhale + SNEEZE_BLOW) s.state = 'fade';
  if (s.t >= S.inhale + SNEEZE_FADE) s.done = true;
}

/**
 * Every enemy in the circle, at any height, is blown back toward its own side
 * (less toward the edge, fliers and floaters further): a shove with a little
 * damage and stun. Hats pop, holders let go, structures take a little.
 */
function achoo(b, s) {
  const S = SPELLS.bigSneeze;
  b.emit('sneeze', s.x, s.y - 60, { spell: s, radius: s.radius });
  for (const e of b.units) {
    if (e.team === s.team || !e.alive || e.gone) continue;
    const d = Math.abs(e.hip.x - s.x);
    if (d > s.radius + e.R * 0.5) continue;
    const k = Math.max(0, 1 - (S.falloff * d) / s.radius);
    const dvx = s.f * S.push * k * (e.type.flying || e.floatT > 0 ? S.air : 1);
    if (e.holding) b.letGoOf(e, 'sneeze', s.f * 150, -150); // ACHOO! (it drops its catch)
    e.takeHit(b, { damage: S.damage * s.dmgMul, dvx, dvy: -S.up, x: e.chest.x, y: e.chest.y, stun: S.stun, kind: 'sneeze', from: s, shove: true, spin: 0.5 });
    if (e.hat) b.popHat(e, dvx, -S.up);
  }
  for (const t of b.towers) {
    if (t.team === s.team || !t.alive || Math.abs(t.x - s.x) > s.radius + t.w / 2) continue;
    damageTower(b, t, S.damage * s.dmgMul * takesOf(t, 'spell'), clamp(s.x, t.x - t.w / 2, t.x + t.w / 2), -t.h * 0.5, 'spell', s);
  }
}

// --- Shaken Soda ----------------------------------------------------------------------

/** Fizz for `fuse` s (shake 0 -> 1: the warning), erupt once, then the foam and the empty bottle. */
function soda(b, s) {
  const S = SPELLS.shakenSoda;
  if (s.state === 'fizz') {
    s.shake = clamp(s.t / S.fuse, 0, 1);
    if (s.t < S.fuse) return;
    s.state = 'erupt';
    s.shake = 1;
    erupt(b, s);
  }
  if (s.state === 'erupt' && s.t >= S.fuse + S.erupt) s.state = 'fade';
  if (s.t >= S.fuse + S.erupt + SODA_FADE) s.done = true;
}

/**
 * The geyser: every enemy in the circle, at any height, goes straight up
 * (harder in the middle) and a little out to the side; fliers lose their lift
 * for a moment. Light beans come down hard enough to take fall damage.
 */
function erupt(b, s) {
  const S = SPELLS.shakenSoda;
  b.emit('sodaErupt', s.x, s.y, { spell: s, radius: s.radius });
  for (const e of b.units) {
    if (e.team === s.team || !e.alive || e.gone) continue;
    const dx = e.hip.x - s.x;
    if (Math.abs(dx) > s.radius + e.R * 0.5) continue;
    const k = clamp(1 - Math.abs(dx) / s.radius, 0, 1);
    e.takeHit(b, {
      damage: S.damage * s.dmgMul,
      dvx: (Math.sign(dx) || s.f) * S.side * k,
      dvy: -S.lift * (0.5 + 0.5 * k),
      x: e.hip.x,
      y: e.ground,
      stun: S.stun,
      kind: 'soda',
      from: s,
      spin: 0.6,
      flip: 90 * k,
    });
    if (e.alive) e.liftOff(b, S.airLiftOff, s); // (fliers only)
  }
  for (const t of b.towers) {
    if (t.team === s.team || !t.alive || Math.abs(t.x - s.x) > s.radius + t.w / 2) continue;
    damageTower(b, t, S.damage * s.dmgMul * takesOf(t, 'spell'), clamp(s.x, t.x - t.w / 2, t.x + t.w / 2), -12, 'spell', s);
  }
}

// --- Anvil ----------------------------------------------------------------------------

/** Where a falling anvil at x comes to rest: on the roof of a standing structure under it, else the ground. */
function anvilFloor(b, s) {
  let y = groundY() - s.r;
  for (const t of b.towers) if (t.alive && Math.abs(t.x - s.x) < t.w / 2) y = Math.min(y, -t.h - s.r);
  return y;
}

/** Straight down at x, landing at t = fall (CLANG), then it rests and fades. */
function anvil(b, s, dt) {
  const S = SPELLS.anvil;
  if (s.state === 'fall') {
    s.vy += G * dt;
    s.y += s.vy * dt;
    const floor = anvilFloor(b, s);
    if (s.y < floor && s.t < S.fall) return;
    s.y = Math.min(s.y, floor);
    s.vy = 0;
    s.state = 'rest';
    anvilImpact(b, s);
    return;
  }
  s.restT += dt;
  s.alpha = clamp((S.rest - s.restT) / ANVIL_FADE, 0, 1);
  if (s.restT >= S.rest) s.done = true;
}

/**
 * CLANG: everything of the enemy's in the column, at any height, takes the
 * big hit (a Squire's shield takes most of it). Fliers are slammed down with
 * their lift off, survivors are squashed flat, structures take their share.
 */
function anvilImpact(b, s) {
  const S = SPELLS.anvil;
  let hits = 0;
  for (const e of b.units) {
    if (e.team === s.team || !e.alive || e.gone) continue;
    if (Math.abs(e.hip.x - s.x) > s.radius + e.R) continue;
    const air = e.air;
    e.takeHit(b, {
      damage: S.damage * s.dmgMul * (e.type.shield ? S.shield : 1),
      dvx: 0,
      dvy: air ? S.carry : 60,
      x: e.head.x,
      y: e.head.y,
      stun: S.stun,
      kind: 'anvil',
      from: s,
      spin: 0.2,
    });
    hits++;
    if (!e.alive) continue;
    e.squashT = S.squash;
    e.liftOff(b, S.liftOff, s); // (fliers only)
  }
  for (const t of b.towers) {
    if (t.team === s.team || !t.alive || Math.abs(t.x - s.x) > s.radius + t.w / 2) continue;
    hits++;
    damageTower(b, t, S.damage * s.dmgMul * takesOf(t, 'spell'), clamp(s.x, t.x - t.w / 2, t.x + t.w / 2), Math.max(-t.h, s.y + s.r), 'spell', s);
  }
  b.emit('anvilImpact', s.x, s.y + s.r, { spell: s, power: 1.4, hits });
}

// --- Bubble Wrap ----------------------------------------------------------------------

/**
 * At the cast: every own bean in the circle (ground or air, still dropping
 * too) is wrapped: it absorbs `absorb` damage (times the card level) for
 * `time` s. Recasting refreshes a wrap, it never stacks. The rest (absorbing,
 * softer stun, no fall damage, the bounce) is in Unit.
 */
function wrapUp(b, s) {
  const S = SPELLS.bubbleWrap;
  for (const u of b.units) {
    if (u.team !== s.team || !u.alive || u.gone) continue;
    if (Math.abs(u.hip.x - s.x) > s.radius + u.R * 0.5) continue;
    u.wrapHp = u.wrapMax = S.absorb * s.dmgMul;
    u.wrapT = S.time;
    b.emit('wrap', u.chest.x, u.chest.y, { unit: u });
  }
}
