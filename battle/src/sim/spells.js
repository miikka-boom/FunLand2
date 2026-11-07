// Spells: cards that are cast anywhere on the field instead of dropping units.
//
// Each spell is a little entity in battle.spells ({ kind, team, x, y, t, ... },
// drawn by render/spells.js) that lives for a moment, does its thing to enemy
// beans and towers, and removes itself. They are physical: the Boulder sends
// beans flying, the Arrow Rain fires real arrows that stick (pincushions), the
// Cheese Wheel bowls beans over as it rolls past.
//
// Spells only hurt the other team. Towers take TOWER_TAKES.spell of the damage.
// Every number here is gameplay: the balance tests tune these constants.

import { WORLD } from '../config.js';
import { levelMul } from './cards.js';
import { TOWER_TAKES, damageTower, rectDist } from './towers.js';

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
};

/** Card spell names -> entity kinds. */
const KIND = { boulder: 'boulder', arrowRain: 'arrowRain', cheeseWheel: 'wheel', wheel: 'wheel' };

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
  } else {
    const r = card.radius || 40;
    s = { ...base, x, y: groundY() - r, r, rot: 0, vx: f * SPELLS.wheel.speed, dist: 0, hit: new Set() };
  }
  b.spells.push(s);
  b.emit('spellCast', x, s.y, { team, spell: kind, card: card.id, entity: s });
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
    damageTower(b, t, S.damage * s.dmgMul * TOWER_TAKES.spell, clamp(x, t.x - t.w / 2, t.x + t.w / 2), clamp(y, -t.h, 0), 'spell', s);
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
    damageTower(b, t, S.damage * s.dmgMul * TOWER_TAKES.spell, clamp(s.x, t.x - t.w / 2, t.x + t.w / 2), -t.h, 'spell', s);
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
    damageTower(b, t, S.damage * s.dmgMul * TOWER_TAKES.spell, s.x, s.y, 'spell', s);
  }
  if (s.dist >= S.dist || s.x < s.r || s.x > WORLD.width - s.r) {
    s.done = true;
    b.emit('wheelEnd', s.x, s.y, { team: s.team, spell: s });
  }
}
