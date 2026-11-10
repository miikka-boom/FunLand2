// Card faces: a rarity frame, an illustration (a real settled ragdoll of the
// unit, or painted spell art) and the mana drop, painted onto a canvas for the
// hand, the deck and the collection. Faces are cached per card, size and
// options, so the UI can redraw a hand every frame for the cost of a drawImage.
//
//   drawCardArt(canvas, 'clubbers', { level: 3 });   // fills the canvas (device px)
//   const face = cardFace('boulder', 120, 156, { mini: true, dim: true });  // cached canvas
//   drawLegendarySheen(ctx, x, y, w, h, t, opts);   // the moving shine over a legendary face
//   drawCardBadge(ctx, 'flying' | 'building' | 'anywhere', x, y, r);
//
// Legendary cards get a teal frame with a static rainbow sheen, gold trim,
// corner gems and a crown crest. Cards that fly, are buildings or land
// anywhere carry a corner badge (a wing, a brick, a target).
//
// opts: {
//   level     card level: a "Level N" ribbon at the bottom (not on mini cards)
//   locked    greyed out with a padlock (the UI says which arena unlocks it)
//   dim       not enough mana: darker and washed out
//   mini      hand size: thinner frame, no ribbon
//   name      true: the card's name on the ribbon (the level moves to a corner tab)
//   palette   army colours for the beans ({ body, shade, light, limb, dark })
//   hats      { unitTypeId: hatId } equipped hats
//   team      'blue' (default) or 'red'
// }

import { TEAMS } from '../config.js';
import { CARDS, RARITIES } from '../sim/cards.js';
import { Battle, DT } from '../sim/battle.js';
import { UnitRenderer, drawArrow, unitExtent } from './units.js';
import { drawBoulderShape, drawCheeseWheel, drawPeel, drawSneezeCloud, drawSodaBottle, drawAnvilShape } from './spells.js';
import { drawBuildingArt } from './buildings.js';
import { drawHat } from './hats.js';

const TAU = Math.PI * 2;
const NEW_SPELLS = new Set(['bananaPeels', 'bigSneeze', 'shakenSoda', 'anvil', 'bubbleWrap']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FONT = '"Arial Black", "Segoe UI Black", system-ui, sans-serif';
const INK = '#2a1d14';
const MAX_FACES = 240;

const gfx = new UnitRenderer();
const faces = new Map(); // key -> canvas
const posed = new Map(); // `${unit}|${n}|${team}|${hat}` -> { b, units }

function rgbOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function mix(a, b, t) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function rgba(hex, a) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function sparkle(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.28 : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

// --- Illustrations -------------------------------------------------------------------

/** 1-3 settled beans of a unit card (a real ragdoll, like the old unit icons). */
function poseUnits(card, team, hat) {
  const n = clamp(card.count || 1, 1, 3);
  const key = `${card.unit}|${n}|${team}|${hat || ''}`;
  let p = posed.get(key);
  if (p) return p;
  const b = new Battle(5);
  if (hat && hat !== 'none') b.hats[team] = { [card.unit]: hat };
  const units = [];
  const probe = b.addUnit(card.unit, team, 0, 0, 77);
  const gap = probe ? probe.R * 1.9 + 8 : 30;
  const dir = team === 'red' ? -1 : 1;
  // Back row first (higher lane = nearer); the lead bean stands in front
  if (n === 1) units.push(probe);
  else {
    b.removeUnit(probe);
    const slots = n === 2 ? [[-0.55, 0], [0.55, 1]] : [[-1, 0.1], [1, 0.3], [0, 1]];
    slots.forEach(([o, lane], i) => units.push(b.addUnit(card.unit, team, o * gap * dir, lane, 77 + i * 31)));
  }
  for (let i = 0; i < 90; i++) b.step(DT);
  p = { b, units: units.filter(Boolean) };
  if (posed.size > 64) posed.clear();
  posed.set(key, p);
  return p;
}

function unitArt(g, card, ax, ay, aw, ah, opts) {
  const team = opts.team === 'red' ? 'red' : 'blue';
  const hat = opts.hats && opts.hats[card.unit];
  if (STAGES[card.id]) {
    stagedArt(g, stageOf(card, team, hat), ax, ay, aw, ah, opts);
    return;
  }
  const { b, units } = poseUnits(card, team, hat);
  if (!units.length) return;
  // Fit everything (hats, weapons, the giant Brick) into the window
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const u of units) {
    const hatTop = u.hat ? u.R * 1.4 : 0;
    for (const p of u.parts) {
      x0 = Math.min(x0, p.x - u.R);
      x1 = Math.max(x1, p.x + u.R);
      y0 = Math.min(y0, p.y - u.R - (p === u.head ? hatTop : 0));
    }
    y1 = Math.max(y1, u.ground + 3);
  }
  const s = Math.min((aw * 0.84) / (x1 - x0), (ah * 0.8) / (y1 - y0));
  const cx = (x0 + x1) / 2;
  const base = ay + ah * 0.93; // where the grass is
  g.save();
  g.translate(ax + aw / 2, base);
  g.scale(s, s);
  g.translate(-cx, -y1);
  const keep = gfx.palettes[team];
  gfx.palettes[team] = opts.palette || keep || TEAMS[team];
  gfx.drawShadows(g, b);
  gfx.drawUnits(g, b, 0);
  gfx.palettes[team] = keep;
  g.restore();
}

function speedLines(g, x, y, dx, dy, n, len, gap, w) {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * gap;
    const L = len * (1 - Math.abs(i - (n - 1) / 2) * 0.25);
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x - uy * o, y + ux * o);
    g.lineTo(x - uy * o - ux * L, y + ux * o - uy * L);
    g.stroke();
  }
}

function dustPuff(g, x, y, r) {
  g.fillStyle = '#d9c59b';
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = '#f1e7cb';
  g.beginPath();
  g.arc(x - r * 0.08, y - r * 0.17, r * 0.84, 0, TAU);
  g.fill();
}

// --- Staged art for the newer cards ---------------------------------------------------
// Real settled ragdolls again, but posed for the picture: each card's stage
// places its beans, settles them, then nudges what the renderer reads (an act
// phase, a float, a held bean) and lifts or tilts whole beans (dx, dy, rot, s
// about the hips) so fliers hover over their shadows. Cached per card, team and hat.

const staged = new Map(); // `${card}|${team}|${hat}` -> stage
const NET_SHOW = 2.95; // a netted flier (netImmuneT): the mesh is drawn over it

/** Put held bean v where holder h holds it, as the sim's hold spring would. */
function holdFor(h, v) {
  const [ax, ay] = h.holdPoint();
  const dx = ax - v.chest.x;
  const dy = ay - v.chest.y;
  for (const p of v.parts) {
    p.x += dx;
    p.y += dy;
    p.px += dx;
    p.py += dy;
  }
  v.held = true;
  v.heldBy = h;
  h.holding = v;
}

/** Point an umbrella straight up from over its head, open (the Brolly's float pose). */
function openBrolly(u) {
  const h = u.hand[u.mainHand];
  const e = u.elbow[u.mainHand];
  h.x = u.chest.x + u.fwx * 3 + u.ux * 24;
  h.y = u.chest.y + u.fwy * 3 + u.uy * 24;
  e.x = (u.chest.x + h.x) / 2 + u.fwx * 7;
  e.y = (u.chest.y + h.y) / 2 + u.fwy * 7;
  u.tip.x = h.x + u.ux * u.W.len;
  u.tip.y = h.y + u.uy * u.W.len;
  u.floatT = 1;
}

/** Each new unit card's stage: (st, put, dir, foe) after the beans are placed; settle() runs in between. */
const STAGES = {
  sprouts: {
    place: (put, dir) => [put('sprout', -15 * dir, 0.1, 77), put('sprout', 15 * dir, 0.9, 108)],
    pose(st, dir) {
      st.actors.forEach((a, i) => {
        const u = a.u;
        u.hip.px = u.hip.x - dir * 1.4; // running flat out: the leaves stream back
        const h = u.hand[u.mainHand];
        u.tip.x = h.x + dir * u.W.len * 0.97; // toothpicks forward
        u.tip.y = h.y - u.W.len * 0.2;
        u.mouth = 0.3;
        u.brow = 1;
        a.rot = dir * 0.22;
        a.dy = i ? 0 : -6;
      });
      st.back = (g) => {
        for (const { u, dy } of st.actors) speedLines(g, u.chest.x - dir * u.R * 1.3, u.chest.y + dy, -dir, 0, 3, 16, 6, 1.6);
      };
    },
  },
  propellerPals: {
    place: (put, dir) => [put('copter', -30 * dir, 0, 77), put('copter', 2 * dir, 0.5, 108), put('copter', 30 * dir, 1, 139)],
    pose(st, dir) {
      const [a, b, c] = st.actors;
      a.dy = 20;
      b.dy = 52;
      c.dy = 74;
      c.rot = dir * 1.15; // head first: the dive-bonk
      c.u.brow = 1;
      c.u.mouth = 0.5;
      st.front = (g) => {
        const u = c.u;
        speedLines(g, u.hip.x - dir * 4, u.hip.y + c.dy - 10, -dir * 0.7, -1, 3, 18, 6, 1.6);
      };
    },
  },
  pogoBean: {
    place: (put, dir, foe) => [put('pogo', 0, 0.3, 77), put('clubber', 6 * dir, 0.8, 108, { team: foe })],
    pose(st, dir) {
      const [p, c] = st.actors;
      p.dy = -48;
      p.rot = dir * 0.12;
      p.u.mouth = 0.6;
      p.u.mouthKind = 'smile';
      c.s = 0.7;
      c.u.mouth = 0.5;
      c.u.eyes[0].oy = c.u.eyes[1].oy = -2.5; // looking up at it
      st.front = (g) => {
        const u = p.u;
        const tx = u.tip.x;
        const ty = u.tip.y + p.dy;
        g.strokeStyle = 'rgba(255,255,255,0.85)';
        g.lineWidth = 2;
        g.lineCap = 'round';
        // The hop's arc, and boing marks under the foot
        g.setLineDash([5, 5]);
        g.beginPath();
        g.moveTo(tx - dir * 70, u.ground);
        g.quadraticCurveTo(tx - dir * 40, ty - 30, tx, ty + 6);
        g.stroke();
        g.setLineDash([]);
        for (const k of [-1, 1]) {
          g.beginPath();
          g.arc(tx + k * 6, ty + 10, 7, k > 0 ? 0.2 : Math.PI - 1.2, k > 0 ? 1.2 : Math.PI - 0.2);
          g.stroke();
        }
      };
    },
  },
  netter: {
    place: (put, dir, foe) => [put('netter', 0, 0.5, 77), put('copter', 0, 0.5, 108, { team: foe, shadow: false })],
    pose(st, dir) {
      const [n, c] = st.actors;
      const u = n.u;
      // Net raised high, the hoop over its head
      const h = u.hand[u.mainHand];
      u.tip.x = h.x + dir * u.W.len * 0.26;
      u.tip.y = h.y - u.W.len * 0.96;
      u.brow = 1;
      u.mouth = 0.4;
      u.mouthKind = 'smile';
      // A tiny Propeller Pal caught in it
      c.s = 0.55;
      const v = c.u;
      c.dx = u.tip.x - (v.hip.x + (v.chest.x - v.hip.x) * c.s);
      c.dy = u.tip.y - (v.hip.y + (v.chest.y - v.hip.y) * c.s);
      v.netImmuneT = NET_SHOW;
      v.mouth = 1;
    },
  },
  bombJuggler: {
    place: (put) => [put('juggler', 0, 0.5, 77)],
    pose(st) {
      const u = st.actors[0].u;
      u.mouth = 0.15; // a nervous little "o"
      for (const e of u.eyes) {
        e.ox = 0;
        e.oy = -2.6; // eyes on the bombs
      }
    },
  },
  nutcracker: {
    place: (put) => [put('nutcracker', 0, 0.5, 77)],
    pose(st, dir) {
      const u = st.actors[0].u;
      u.act = { phase: 'windup', t: u.type.attack.windup * 0.98, variant: 0, hits: new Set(), done: false };
      u.brow = 1;
      st.front = (g) => {
        // A walnut, right in front of the jaw
        const x = u.head.x + u.fwx * u.R * 2.1 - u.ux * u.R * 0.5;
        const y = u.head.y + u.fwy * u.R * 2.1 - u.uy * u.R * 0.5 + 6;
        const r = u.R * 0.55;
        g.fillStyle = '#2a1d14';
        g.beginPath();
        g.ellipse(x, y, r + 1.4, r * 0.85 + 1.4, 0.3, 0, TAU);
        g.fill();
        g.fillStyle = '#a8743c';
        g.beginPath();
        g.ellipse(x, y, r, r * 0.85, 0.3, 0, TAU);
        g.fill();
        g.strokeStyle = '#6a4220';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(x - r * 0.7, y - r * 0.5);
        g.quadraticCurveTo(x, y + r * 0.1, x + r * 0.7, y + r * 0.5);
        g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.beginPath();
        g.ellipse(x - r * 0.35, y - r * 0.35, r * 0.25, r * 0.15, 0.3, 0, TAU);
        g.fill();
      };
    },
  },
  brollyBrigade: {
    place: (put, dir) => [put('brolly', -40 * dir, 0, 77), put('brolly', 0, 0.5, 108), put('brolly', 40 * dir, 1, 139)],
    pose(st) {
      const dys = [-34, -88, -8];
      st.actors.forEach((a, i) => {
        openBrolly(a.u);
        a.dy = dys[i];
        a.rot = (i - 1) * 0.07;
        a.u.mouth = i === 1 ? 0.4 : 0;
      });
    },
  },
  tummyDrummer: {
    place: (put) => [put('drummer', 0, 0.5, 77)],
    pose(st, dir) {
      const u = st.actors[0].u;
      u.beatClock = 0.02; // just struck: the head flashes
      u.mouth = 0.5;
      u.mouthKind = 'smile';
      st.front = (g) => {
        const x = u.hip.x * 0.72 + u.chest.x * 0.28 + u.fwx * u.R * 1.32;
        const y = u.hip.y * 0.72 + u.chest.y * 0.28 + u.fwy * u.R * 1.32;
        g.lineCap = 'round';
        for (const [r, a] of [[u.R * 1.5, 0.9], [u.R * 2.3, 0.55]]) {
          g.strokeStyle = `rgba(255,255,255,${a})`;
          g.lineWidth = 3;
          g.beginPath();
          g.arc(x, y, r, dir > 0 ? -1.1 : Math.PI - 1.1, dir > 0 ? 1.1 : Math.PI + 1.1);
          g.stroke();
        }
      };
    },
  },
  pelican: {
    place: (put, dir, foe) => [put('pelican', 0, 0.5, 77), put('archer', 0, 0.5, 108, { team: foe, actor: false })],
    pose(st) {
      const p = st.actors[0];
      holdFor(p.u, st.extra[0]);
      st.extra[0].mouth = 1;
      p.dy = 70;
    },
  },
  bigJelly: {
    place: (put, dir, foe) => [put('jelly', 0, 0.5, 77), put('sprout', 0, 0.5, 108, { team: foe, actor: false })],
    pose(st) {
      const v = st.extra[0];
      holdFor(st.actors[0].u, v);
      v.mouth = 1;
      v.eyes[0].oy = v.eyes[1].oy = -1;
    },
  },
};

function stageOf(card, team, hat) {
  const key = `${card.id}|${team}|${hat || ''}`;
  let st = staged.get(key);
  if (st) return st;
  const S = STAGES[card.id];
  const b = new Battle(5);
  if (hat && hat !== 'none') b.hats[team] = { [card.unit]: hat };
  const dir = team === 'red' ? -1 : 1;
  const foe = team === 'red' ? 'blue' : 'red';
  st = { b, actors: [], extra: [], back: null, front: null };
  const put = (id, x, lane, seed, o = {}) => {
    const u = b.addUnit(id, o.team || team, x, lane, seed);
    if (!u) return null;
    u.speed = 0; // posed where it was put (no waddling off toward a deploy zone)
    if (o.actor === false) st.extra.push(u);
    else st.actors.push({ u, dx: 0, dy: 0, rot: 0, s: 1, shadow: o.shadow !== false });
    return u;
  };
  S.place(put, dir, foe);
  for (let i = 0; i < 90; i++) b.step(DT);
  S.pose(st, dir);
  if (staged.size > 64) staged.clear();
  staged.set(key, st);
  return st;
}

/** Apply an actor's lift / tilt / scale (about its hips) to g. */
function actorTransform(g, a) {
  const h = a.u.hip;
  g.translate(h.x + a.dx, h.y + a.dy);
  if (a.rot) g.rotate(a.rot);
  if (a.s !== 1) g.scale(a.s, a.s);
  g.translate(-h.x, -h.y);
}

const EXT = {};
/** The staged picture, fitted into the art window like the settled beans are. */
function stagedArt(g, st, ax, ay, aw, ah, opts) {
  const team = opts.team === 'red' ? 'red' : 'blue';
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const a of st.actors) {
    const e = unitExtent(a.u, EXT);
    if (a.u.holding) {
      const v = unitExtent(a.u.holding, {});
      e.x0 = Math.min(e.x0, v.x0);
      e.x1 = Math.max(e.x1, v.x1);
      e.y0 = Math.min(e.y0, v.y0);
      e.y1 = Math.max(e.y1, v.y1);
    }
    const h = a.u.hip;
    const c = Math.cos(a.rot);
    const s = Math.sin(a.rot);
    for (const [px, py] of [[e.x0, e.y0], [e.x1, e.y0], [e.x0, e.y1], [e.x1, e.y1]]) {
      const lx = (px - h.x) * a.s;
      const ly = (py - h.y) * a.s;
      const wx = h.x + a.dx + lx * c - ly * s;
      const wy = h.y + a.dy + lx * s + ly * c;
      x0 = Math.min(x0, wx);
      x1 = Math.max(x1, wx);
      y0 = Math.min(y0, wy);
    }
    y1 = Math.max(y1, a.u.ground + 3);
  }
  if (!(x1 > x0) || !(y1 > y0)) return;
  const k = Math.min((aw * 0.86) / (x1 - x0), (ah * 0.82) / (y1 - y0));
  const cx = (x0 + x1) / 2;
  g.save();
  g.translate(ax + aw / 2, ay + ah * 0.93);
  g.scale(k, k);
  g.translate(-cx, -y1);
  const keep = gfx.palettes[team];
  gfx.palettes[team] = opts.palette || keep || TEAMS[team];
  // Ground shadows: under each bean, smaller and fainter the higher it hangs
  g.fillStyle = 'rgb(22, 40, 8)';
  for (const a of st.actors) {
    if (!a.shadow) continue;
    const u = a.u;
    const up = clamp((u.ground - u.standH - u.hip.y - a.dy) / 260, 0, 1);
    const wide = u.type.shape === 'bird' ? 2.3 : u.type.shape === 'jelly' ? 1.4 : u.floatT > 0 ? 1.7 : 1.3;
    g.globalAlpha = 0.34 * (1 - 0.45 * up);
    g.beginPath();
    g.ellipse(u.hip.x + a.dx, u.ground + 1.5, u.R * wide * (1 - 0.4 * up) * a.s, 4 * (1 - 0.35 * up), 0, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
  if (st.back) st.back(g);
  for (const a of st.actors) {
    g.save();
    actorTransform(g, a);
    gfx.drawUnit(g, a.u, st.b, 0);
    g.restore();
  }
  if (st.front) st.front(g);
  gfx.palettes[team] = keep;
  g.restore();
}

// --- Spells and buildings of the newer cards (W4's shapes) -----------------------------

const props = new Map(); // `${unit}|${team}|${tag}` -> { b, u }: a lone settled bean for a picture

/** A lone settled bean to draw into a spell or building picture (its own battle, so poses never leak). */
function propBean(unit, team, tag, setup) {
  const key = `${unit}|${team}|${tag}`;
  let p = props.get(key);
  if (p) return p;
  const b = new Battle(5);
  const u = b.addUnit(unit, team, 0, 0.5, 91);
  if (!u) return null;
  for (let i = 0; i < 90; i++) b.step(DT);
  if (setup) setup(u);
  p = { b, u };
  if (props.size > 48) props.clear();
  props.set(key, p);
  return p;
}

/** Draw a prop bean with its hips at (x, y), scaled by s and turned by rot. */
function drawBeanAt(g, p, x, y, s, rot = 0, pal = null) {
  if (!p) return;
  const { b, u } = p;
  const keep = gfx.palettes[u.team];
  if (pal) gfx.palettes[u.team] = pal;
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(s, s);
  g.translate(-u.hip.x, -u.hip.y);
  gfx.drawUnit(g, u, b, 0);
  g.restore();
  gfx.palettes[u.team] = keep;
}

const worried = (u) => {
  u.mouth = 1;
  u.mouthKind = 'o';
  for (const e of u.eyes) {
    e.ox = 0;
    e.oy = -3;
  }
};
const flung = (u) => {
  u.mouth = 1;
  u.mouthKind = 'o';
  u.dizzy = 0;
};

function newSpellArt(g, card, ax, ay, aw, ah, opts) {
  const k = Math.min(aw, ah);
  const gy = ay + ah * 0.9;
  const team = opts.team === 'red' ? 'red' : 'blue';
  const foe = team === 'red' ? 'blue' : 'red';
  const dir = team === 'red' ? -1 : 1;
  const T = opts.palette || TEAMS[team];
  const lw = Math.max(1.5, k * 0.025);
  const id = card.spell;
  if (id === 'bananaPeels') {
    // Somebody just went feet-up behind the peel
    const cx = ax + aw * 0.55;
    for (const i of [-1, 1]) {
      const fx = cx + i * k * 0.13 + k * 0.06;
      g.lineCap = 'round';
      g.strokeStyle = TEAMS[foe].limb;
      g.lineWidth = k * 0.085;
      g.beginPath();
      g.moveTo(cx + i * k * 0.05, gy - k * 0.05);
      g.quadraticCurveTo(cx + i * k * 0.2, ay + ah * 0.45, fx, ay + ah * 0.14);
      g.stroke();
      g.fillStyle = TEAMS[foe].dark;
      g.beginPath();
      g.ellipse(fx + k * 0.03, ay + ah * 0.12, k * 0.075, k * 0.045, -0.5 * i, 0, TAU);
      g.fill();
    }
    speedLines(g, cx - k * 0.32, ay + ah * 0.3, 0, -1, 3, k * 0.18, k * 0.07, lw);
    speedLines(g, cx + k * 0.42, ay + ah * 0.32, 0, -1, 2, k * 0.14, k * 0.07, lw);
    drawPeel(g, ax + aw * 0.42, gy + k * 0.02, k / 32, -0.12, false);
  } else if (id === 'bigSneeze') {
    const s = k / 95;
    speedLines(g, ax + aw * 0.98, ay + ah * 0.52, 1, 0, 4, k * 0.3, k * 0.1, lw);
    g.fillStyle = 'rgba(160,220,255,0.9)';
    for (const [u, v, r] of [[0.74, 0.44, 0.025], [0.8, 0.58, 0.02], [0.7, 0.66, 0.018], [0.86, 0.5, 0.015]]) {
      g.beginPath();
      g.arc(ax + aw * u, ay + ah * v, k * r, 0, TAU);
      g.fill();
    }
    drawSneezeCloud(g, ax + aw * 0.4, ay + ah * 0.55, s, 1, 0.5, 0.85);
    // Two hats blown clean off, tumbling out of the picture
    drawHat(g, 'tophat', ax + aw * 0.84, ay + ah * 0.26, 0.6, k * 0.13, TEAMS[foe], 0);
    drawHat(g, 'party', ax + aw * 0.9, ay + ah * 0.8, 1.9, k * 0.12, TEAMS[foe], 0);
  } else if (id === 'shakenSoda') {
    const s = k / 80;
    const bx = ax + aw * 0.5;
    // Foam bursting out of the neck, the cap flying off
    const ny = gy - 50 * s;
    g.fillStyle = '#f4ecd8';
    g.strokeStyle = '#2a1d14';
    g.lineWidth = Math.max(1, k * 0.015);
    const puffs = [[0, -0.02, 0.07], [-0.05, -0.12, 0.08], [0.06, -0.18, 0.09], [-0.03, -0.3, 0.11], [0.1, -0.36, 0.08], [-0.13, -0.38, 0.08]];
    for (const [u, v, r] of puffs) {
      g.beginPath();
      g.arc(bx + u * k, ny + v * k, r * k + g.lineWidth, 0, TAU);
      g.fillStyle = '#2a1d14';
      g.fill();
    }
    for (const [u, v, r] of puffs) {
      g.beginPath();
      g.arc(bx + u * k, ny + v * k, r * k, 0, TAU);
      g.fillStyle = '#f4ecd8';
      g.fill();
      g.beginPath();
      g.arc(bx + u * k - r * k * 0.3, ny + v * k - r * k * 0.3, r * k * 0.35, 0, TAU);
      g.fillStyle = '#ffffff';
      g.fill();
    }
    drawSodaBottle(g, bx, gy, s, 1, 0.37, false);
    const cx = bx - k * 0.32;
    const cy = ay + ah * 0.16;
    speedLines(g, cx + k * 0.06, cy + k * 0.06, -1, -1, 2, k * 0.12, k * 0.05, lw);
    g.fillStyle = '#2a1d14';
    g.beginPath();
    g.arc(cx, cy, k * 0.06, 0, TAU);
    g.fill();
    g.fillStyle = '#c9d1d9';
    g.beginPath();
    g.arc(cx, cy, k * 0.047, 0, TAU);
    g.fill();
  } else if (id === 'anvil') {
    const s = k / 100;
    const x = ax + aw * 0.5;
    // Its shadow, growing on the grass round a worried bean
    g.fillStyle = 'rgba(20,20,30,0.45)';
    g.beginPath();
    g.ellipse(x, gy, k * 0.3, k * 0.06, 0, 0, TAU);
    g.fill();
    drawBeanAt(g, propBean('archer', foe, 'worried', worried), x - dir * k * 0.03, gy - k * 0.2, s * 0.8);
    speedLines(g, x, ay + ah * 0.04, 0, -1, 3, k * 0.1, k * 0.11, lw);
    drawAnvilShape(g, x, ay + ah * 0.24, s * 1.05, dir);
  } else if (id === 'bubbleWrap') {
    const s = k / 92;
    const x = ax + aw * 0.5;
    dustPuff(g, x - k * 0.18, gy - k * 0.02, k * 0.08);
    dustPuff(g, x + k * 0.16, gy - k * 0.01, k * 0.07);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = lw;
    g.lineCap = 'round';
    for (const i of [-1, 1]) {
      g.beginPath();
      g.arc(x + i * k * 0.03, gy - k * 0.02, k * 0.16, i > 0 ? -0.9 : Math.PI + 0.4, i > 0 ? -0.4 : Math.PI + 0.9);
      g.stroke();
    }
    const p = propBean('archer', team, 'wrapped', (u) => {
      u.wrapHp = u.wrapMax = 70;
      u.wrapT = 8;
      u.mouth = 0.6;
      u.mouthKind = 'smile';
    });
    drawBeanAt(g, p, x, gy - k * 0.4, s * 1.05, dir * 0.25, opts.palette);
  }
}

function buildingArt(g, card, ax, ay, aw, ah, opts) {
  const team = opts.team === 'red' ? 'red' : 'blue';
  const foe = team === 'red' ? 'blue' : 'red';
  const dir = team === 'red' ? -1 : 1;
  const k = Math.min(aw, ah);
  const gy = ay + ah * 0.9;
  const lw = Math.max(1.5, k * 0.025);
  const pal = opts.palette;
  const at = (u) => ax + aw * (dir > 0 ? u : 1 - u);
  if (card.building === 'boingBox') {
    const s = Math.min((aw * 0.92) / 150, (ah * 0.8) / 80);
    const x = at(0.26);
    drawBuildingArt(g, 'boingBox', x, gy, s, team, { f: dir, ext: 1 });
    // ...and a bean flying out of the picture
    speedLines(g, at(0.66), ay + ah * 0.48, dir, -0.6, 3, k * 0.16, k * 0.07, lw);
    drawBeanAt(g, propBean('clubber', foe, 'flung', flung), at(0.74), ay + ah * 0.42, s * 1.1, dir * 0.9);
  } else if (card.building === 'beanPatch') {
    const s = Math.min((aw * 0.8) / 64, (ah * 0.55) / 54);
    const x = ax + aw * 0.5;
    drawBuildingArt(g, 'beanPatch', x, gy, s, team, { f: dir, grow: 0.3 });
    // A Sprout popping out of the dirt, clods flying
    g.fillStyle = '#5a3a22';
    for (const [u, v, r] of [[-0.3, 0.42, 0.035], [0.28, 0.36, 0.03], [-0.18, 0.22, 0.025], [0.22, 0.18, 0.028], [0.36, 0.5, 0.022]]) {
      g.beginPath();
      g.arc(x + u * k, gy - v * k - 30 * s, r * k, 0, TAU);
      g.fill();
    }
    const p = propBean('sprout', team, 'pop', (u) => {
      u.mouth = 0.6;
      u.mouthKind = 'smile';
    });
    drawBeanAt(g, p, x - dir * 4 * s, gy - 52 * s, s * 0.9, dir * 0.35, pal);
  } else {
    const s = Math.min((ah * 0.84) / 215, (aw * 0.9) / 175);
    const x = at(0.2);
    drawBuildingArt(g, 'wreckingCrane', x, gy, s, team, { f: dir, ang: dir * 1.0 });
    // The ball's swing, and a bean golf-swung across the field
    const bx = x + dir * (34 + Math.sin(1.0) * 125) * s;
    const by = gy + (-170 + Math.cos(1.0) * 125) * s;
    speedLines(g, bx - dir * 26 * s, by + 12 * s, -dir, 0.7, 3, k * 0.16, k * 0.06, lw);
    drawBeanAt(g, propBean('clubber', foe, 'flung', flung), Math.min(ax + aw * 0.92, Math.max(ax + aw * 0.08, bx + dir * 40 * s)), by - 52 * s, s * 1.6, dir * 1.1);
  }
}

function spellArt(g, card, ax, ay, aw, ah, opts = {}) {
  const k = Math.min(aw, ah);
  const gy = ay + ah * 0.9;
  if (NEW_SPELLS.has(card.spell)) newSpellArt(g, card, ax, ay, aw, ah, opts);
  else if (card.spell === 'boulder') {
    const r = k * 0.27;
    const x = ax + aw * 0.56;
    const y = ay + ah * 0.42;
    g.fillStyle = 'rgba(28,52,12,0.35)';
    g.beginPath();
    g.ellipse(x + r * 0.15, gy, r * 1.05, r * 0.22, 0, 0, TAU);
    g.fill();
    speedLines(g, x - r * 0.7, y - r * 0.7, 1, 1.4, 3, r * 1.4, r * 0.55, Math.max(1.5, k * 0.025));
    drawBoulderShape(g, x, y, r, 0.4, 7);
    dustPuff(g, ax + aw * 0.22, gy - k * 0.03, k * 0.07);
    dustPuff(g, ax + aw * 0.82, gy - k * 0.02, k * 0.06);
  } else if (card.spell === 'arrowRain') {
    // A volley coming down at a slant, the first ones already stuck in the grass
    const s = k / 120;
    g.save();
    const flying = [[0.2, 0.18], [0.45, 0.08], [0.7, 0.2], [0.33, 0.42], [0.58, 0.35], [0.82, 0.45]];
    for (const [u, v] of flying) {
      const x = ax + aw * u;
      const y = ay + ah * v + 30 * s;
      g.save();
      g.translate(x, y);
      g.scale(s * 1.6, s * 1.6);
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(-Math.cos(1.25) * 32, -Math.sin(1.25) * 32);
      g.lineTo(-Math.cos(1.25) * 56, -Math.sin(1.25) * 56);
      g.stroke();
      drawArrow(g, 0, 0, 1.25, 'blue', 1, 0);
      g.restore();
    }
    for (const u of [0.24, 0.5, 0.76]) {
      g.save();
      g.translate(ax + aw * u, gy - 2 * s);
      g.scale(s * 1.6, s * 1.6);
      drawArrow(g, 0, 0, 1.3, 'blue', 1, 5);
      g.restore();
    }
    g.restore();
  } else {
    const r = k * 0.3;
    const x = ax + aw * 0.55;
    const y = gy - r;
    g.fillStyle = 'rgba(28,52,12,0.3)';
    g.beginPath();
    g.ellipse(x, gy + 1, r * 0.95, r * 0.2, 0, 0, TAU);
    g.fill();
    speedLines(g, x - r * 1.1, y, 1, 0, 3, r * 0.9, r * 0.5, Math.max(1.5, k * 0.025));
    drawCheeseWheel(g, x, y, r, 0.9);
    g.fillStyle = '#ffd34d';
    for (const [u, v, sz] of [[-1.35, 0.7, 0.07], [-1.6, 0.4, 0.05], [-1.2, 0.25, 0.04]]) {
      g.beginPath();
      g.rect(x + u * r, y + v * r, sz * k, sz * k);
      g.fill();
    }
  }
}

// --- The face ----------------------------------------------------------------------------

/** Where a face's art window sits (device px), for a W x H face with these options. */
function artWindow(W, H, opts) {
  const u = W / 100;
  const mini = !!opts.mini;
  const inset = (mini ? 6 : 7) * u;
  const bottom = mini || (!opts.level && !opts.name) ? inset : 22 * u;
  return { ax: inset, ay: inset, aw: W - 2 * inset, ah: H - inset - bottom };
}

function manaDrop(g, x, y, r, mana) {
  const drop = (k) => {
    g.beginPath();
    g.moveTo(x, y - r * 1.35 * k);
    g.bezierCurveTo(x + r * 0.55 * k, y - r * 0.7 * k, x + r * k, y - r * 0.2 * k, x + r * k, y + r * 0.25 * k);
    g.arc(x, y + r * 0.25 * k, r * k, 0, Math.PI);
    g.bezierCurveTo(x - r * k, y - r * 0.2 * k, x - r * 0.55 * k, y - r * 0.7 * k, x, y - r * 1.35 * k);
    g.closePath();
  };
  drop(1.14);
  g.fillStyle = INK;
  g.fill();
  drop(1);
  const gr = g.createLinearGradient(x - r, y - r, x + r, y + r);
  gr.addColorStop(0, '#c49bff');
  gr.addColorStop(0.5, '#8b5cf0');
  gr.addColorStop(1, '#3d4fd6');
  g.fillStyle = gr;
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath();
  g.ellipse(x - r * 0.42, y - r * 0.25, r * 0.18, r * 0.36, 0.5, 0, TAU);
  g.fill();
  g.font = `900 ${Math.round(r * 1.25)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = r * 0.32;
  g.strokeStyle = '#25155e';
  g.strokeText(String(mana), x, y + r * 0.32);
  g.fillStyle = '#ffffff';
  g.fillText(String(mana), x, y + r * 0.32);
}

function padlock(g, x, y, s) {
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.lineWidth = s * 0.34;
  g.beginPath();
  g.arc(x, y - s * 0.35, s * 0.62, Math.PI, 0);
  g.lineTo(x + s * 0.62, y);
  g.moveTo(x - s * 0.62, y);
  g.lineTo(x - s * 0.62, y - s * 0.35);
  g.stroke();
  g.strokeStyle = '#d6dbe2';
  g.lineWidth = s * 0.18;
  g.stroke();
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, x - s * 1.05, y - s * 0.12, s * 2.1, s * 1.6, s * 0.3);
  g.fill();
  const gr = g.createLinearGradient(0, y, 0, y + s * 1.4);
  gr.addColorStop(0, '#ffe58a');
  gr.addColorStop(1, '#d69a2a');
  g.fillStyle = gr;
  g.beginPath();
  rrect(g, x - s * 0.9, y + s * 0.02, s * 1.8, s * 1.32, s * 0.22);
  g.fill();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x, y + s * 0.55, s * 0.2, 0, TAU);
  g.rect(x - s * 0.08, y + s * 0.55, s * 0.16, s * 0.45);
  g.fill();
}

function ribbon(g, x, y, w, h, rar, text, size) {
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, x - 1, y - 1, w + 2, h + 2, h * 0.35);
  g.fill();
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, mix(rar.dark, '#000000', 0.15));
  gr.addColorStop(1, mix(rar.dark, '#000000', 0.45));
  g.fillStyle = gr;
  g.beginPath();
  rrect(g, x, y, w, h, h * 0.32);
  g.fill();
  g.fillStyle = rgba(rar.glow, 0.25);
  g.fillRect(x + h * 0.3, y + 1, w - h * 0.6, h * 0.3);
  g.font = `900 ${Math.round(size)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.28;
  g.strokeStyle = INK;
  let t = text;
  while (t.length > 3 && g.measureText(t).width > w - h * 0.5) t = t.slice(0, -1);
  if (t !== text) t = t.slice(0, -1) + '.';
  g.strokeText(t, x + w / 2, y + h * 0.54);
  g.fillStyle = '#ffffff';
  g.fillText(t, x + w / 2, y + h * 0.54);
}

// --- Legendary frame and badges ---------------------------------------------------------------

/** The rainbow sheen of a legendary frame: a diagonal band at `pos` (0..1 across the card). */
function sheenGradient(g, W, H, pos, a = 1) {
  const gr = g.createLinearGradient(0, 0, W, H);
  const at = (d) => clamp(pos + d, 0, 1);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(at(-0.16), 'rgba(255,255,255,0)');
  gr.addColorStop(at(-0.1), `rgba(255,120,190,${0.55 * a})`);
  gr.addColorStop(at(-0.04), `rgba(255,232,120,${0.65 * a})`);
  gr.addColorStop(at(0.02), `rgba(150,255,190,${0.6 * a})`);
  gr.addColorStop(at(0.08), `rgba(120,180,255,${0.55 * a})`);
  gr.addColorStop(at(0.14), 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  return gr;
}

/** A small cut gem with a gold setting (legendary corners). */
function gem(g, x, y, r, col, glow) {
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x, y, r * 1.35, 0, TAU);
  g.fill();
  g.fillStyle = '#f2c94c';
  g.beginPath();
  g.arc(x, y, r * 1.12, 0, TAU);
  g.fill();
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 - Math.PI / 2;
    if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.fillStyle = glow;
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r * 0.62, y - r * 0.32);
  g.lineTo(x, y);
  g.lineTo(x - r * 0.62, y - r * 0.32);
  g.closePath();
  g.fill();
}

/** The legendary crest on the top edge: a gold crown holding a teal gem (the rarity badge). */
function crest(g, x, y, s, rar) {
  const crown = (k) => {
    g.beginPath();
    g.moveTo(x - s * 1.25 * k, y + s * 0.55 * k);
    g.lineTo(x - s * 1.35 * k, y - s * 0.55 * k);
    g.lineTo(x - s * 0.62 * k, y - s * 0.05 * k);
    g.lineTo(x, y - s * 0.85 * k);
    g.lineTo(x + s * 0.62 * k, y - s * 0.05 * k);
    g.lineTo(x + s * 1.35 * k, y - s * 0.55 * k);
    g.lineTo(x + s * 1.25 * k, y + s * 0.55 * k);
    g.closePath();
  };
  g.lineJoin = 'round';
  crown(1);
  g.fillStyle = INK;
  g.lineWidth = s * 0.45;
  g.strokeStyle = INK;
  g.stroke();
  const gr = g.createLinearGradient(0, y - s, 0, y + s * 0.6);
  gr.addColorStop(0, '#fff2b0');
  gr.addColorStop(0.5, '#f2c94c');
  gr.addColorStop(1, '#c48a1e');
  g.fillStyle = gr;
  g.fill();
  gem(g, x, y + s * 0.08, s * 0.32, rar.color, rar.glow);
}

/** Which corner badge a card gets: a wing (flies), a brick (a building) or a target (lands anywhere). */
function badgeOf(card) {
  if (card.kind === 'building') return 'building';
  if (card.flying) return 'flying';
  if (card.anywhere) return 'anywhere';
  return null;
}

/** A round dark badge with a white icon. kind: 'flying' | 'building' | 'anywhere'. */
export function drawCardBadge(g, kind, x, y, r) {
  if (!kind || !(r > 0)) return;
  g.save();
  g.fillStyle = INK;
  g.beginPath();
  g.arc(x, y, r * 1.12, 0, TAU);
  g.fill();
  g.fillStyle = '#4a3d6e';
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.arc(x, y - r * 0.3, r * 0.8, Math.PI * 1.1, Math.PI * 1.9);
  g.fill();
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#ffffff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (kind === 'flying') {
    // A wing: three feathers fanning back from the shoulder
    g.beginPath();
    g.moveTo(x - r * 0.55, y + r * 0.35);
    g.quadraticCurveTo(x - r * 0.2, y - r * 0.7, x + r * 0.65, y - r * 0.55);
    g.lineTo(x + r * 0.35, y - r * 0.25);
    g.lineTo(x + r * 0.62, y - r * 0.18);
    g.lineTo(x + r * 0.3, y + r * 0.08);
    g.lineTo(x + r * 0.52, y + r * 0.2);
    g.quadraticCurveTo(x, y + r * 0.42, x - r * 0.55, y + r * 0.35);
    g.closePath();
    g.fill();
  } else if (kind === 'building') {
    // A brick: a block with a mortar line
    const w = r * 1.2;
    const h = r * 0.78;
    g.fillRect(x - w / 2, y - h / 2, w, h);
    g.strokeStyle = '#4a3d6e';
    g.lineWidth = r * 0.12;
    g.beginPath();
    g.moveTo(x - w / 2, y);
    g.lineTo(x + w / 2, y);
    g.moveTo(x - w * 0.1, y - h / 2);
    g.lineTo(x - w * 0.1, y);
    g.moveTo(x + w * 0.22, y);
    g.lineTo(x + w * 0.22, y + h / 2);
    g.stroke();
  } else {
    // A target
    g.lineWidth = r * 0.16;
    g.beginPath();
    g.arc(x, y, r * 0.58, 0, TAU);
    g.stroke();
    g.beginPath();
    g.arc(x, y, r * 0.2, 0, TAU);
    g.fill();
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      g.moveTo(x + dx * r * 0.42, y + dy * r * 0.42);
      g.lineTo(x + dx * r * 0.82, y + dy * r * 0.82);
    }
    g.stroke();
  }
  g.restore();
}

/**
 * The legendary sheen sweeping across a face already drawn at (x, y, w, h)
 * (device px): call it every frame over a cached legendary face for the deck
 * screen's slow shine (one pass every 2 s, then a pause). Frame ring only:
 * the art window (from opts: mini, level, name, as given to cardFace) is left alone.
 */
export function drawLegendarySheen(ctx, x, y, w, h, t, opts = {}) {
  if (!ctx || !(w > 0) || !(h > 0) || !Number.isFinite(t)) return;
  const p = ((t % 2) + 2) % 2; // 0..2 s
  if (p > 1.4) return;
  const pos = -0.2 + (p / 1.4) * 1.4;
  const u = w / 100;
  const { ax, ay, aw, ah } = artWindow(w, h, opts);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  rrect(ctx, 2.2 * u, 2.2 * u, w - 4.4 * u, h - 4.4 * u, 9 * u);
  rrect(ctx, ax - 1.4 * u, ay - 1.4 * u, aw + 2.8 * u, ah + 2.8 * u, 7 * u);
  ctx.clip('evenodd');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = sheenGradient(ctx, w, h, pos, 0.55);
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function paintFace(cv, card, opts) {
  const g = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const u = W / 100; // design unit
  const rar = RARITIES[card.rarity] || RARITIES.common;
  const mini = !!opts.mini;
  g.clearRect(0, 0, W, H);
  g.save();
  // Frame: ink edge, rarity metal with a lit top-left, an inner bevel
  const R = (mini ? 9 : 10) * u;
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, 0.5, 0.5, W - 1, H - 1, R);
  g.fill();
  const fg = g.createLinearGradient(0, 0, W, H);
  fg.addColorStop(0, rar.glow);
  fg.addColorStop(0.35, rar.color);
  fg.addColorStop(1, rar.dark);
  g.fillStyle = fg;
  const e = 2.2 * u;
  g.beginPath();
  rrect(g, e, e, W - 2 * e, H - 2 * e, R - e * 0.6);
  g.fill();
  const legend = card.rarity === 'legendary';
  if (legend) {
    // A rainbow sheen frozen mid-sweep across the frame (the deck screen animates it: drawLegendarySheen)
    g.fillStyle = sheenGradient(g, W, H, 0.3);
    g.beginPath();
    rrect(g, e, e, W - 2 * e, H - 2 * e, R - e * 0.6);
    g.fill();
    g.fillStyle = sheenGradient(g, W, H, 0.78, 0.6);
    g.fill();
  }
  // Art window
  const { ax, ay, aw, ah } = artWindow(W, H, opts);
  g.fillStyle = mix(rar.dark, '#000000', 0.35);
  g.beginPath();
  rrect(g, ax - 1.4 * u, ay - 1.4 * u, aw + 2.8 * u, ah + 2.8 * u, 7 * u);
  g.fill();
  g.save();
  g.beginPath();
  rrect(g, ax, ay, aw, ah, 6 * u);
  g.clip();
  const sky = g.createLinearGradient(0, ay, 0, ay + ah);
  sky.addColorStop(0, '#6fb2e4');
  sky.addColorStop(0.7, '#cfe9f4');
  g.fillStyle = sky;
  g.fillRect(ax, ay, aw, ah);
  const glow = g.createRadialGradient(ax + aw / 2, ay + ah * 0.55, 0, ax + aw / 2, ay + ah * 0.55, aw * 0.75);
  glow.addColorStop(0, rgba(rar.glow, 0.85));
  glow.addColorStop(1, rgba(rar.glow, 0));
  g.fillStyle = glow;
  g.fillRect(ax, ay, aw, ah);
  // Hills and the grass the beans stand on
  g.fillStyle = '#a8d272';
  g.beginPath();
  g.ellipse(ax + aw * 0.2, ay + ah * 0.92, aw * 0.55, ah * 0.22, 0, Math.PI, TAU);
  g.ellipse(ax + aw * 0.9, ay + ah * 0.95, aw * 0.5, ah * 0.2, 0, Math.PI, TAU);
  g.fill();
  const gg = g.createLinearGradient(0, ay + ah * 0.86, 0, ay + ah);
  gg.addColorStop(0, '#9fd05a');
  gg.addColorStop(1, '#6faa3c');
  g.fillStyle = gg;
  g.fillRect(ax, ay + ah * 0.88, aw, ah * 0.12);
  if (card.kind === 'unit') unitArt(g, card, ax, ay, aw, ah, opts);
  else if (card.kind === 'building') buildingArt(g, card, ax, ay, aw, ah, opts);
  else spellArt(g, card, ax, ay, aw, ah, opts);
  // Soft vignette inside the window
  const vg = g.createRadialGradient(ax + aw / 2, ay + ah / 2, Math.min(aw, ah) * 0.35, ax + aw / 2, ay + ah / 2, Math.max(aw, ah) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(20,10,40,0.28)');
  g.fillStyle = vg;
  g.fillRect(ax, ay, aw, ah);
  g.restore();
  // Bevel highlight on the frame
  g.strokeStyle = rgba('#ffffff', 0.45);
  g.lineWidth = 1.2 * u;
  g.beginPath();
  rrect(g, e + 1.2 * u, e + 1.2 * u, W - 2 * e - 2.4 * u, H - 2 * e - 2.4 * u, R - e);
  g.stroke();
  if (legend) {
    // Gold trim round the art window, gems in the corners, the crown crest on top
    g.strokeStyle = INK;
    g.lineWidth = 2.6 * u;
    g.beginPath();
    rrect(g, ax - 1.4 * u, ay - 1.4 * u, aw + 2.8 * u, ah + 2.8 * u, 7 * u);
    g.stroke();
    g.strokeStyle = '#f2c94c';
    g.lineWidth = 1.4 * u;
    g.stroke();
    for (const [x, y] of [[e + 2.6 * u, H - e - 2.6 * u], [W - e - 2.6 * u, H - e - 2.6 * u], [W - e - 2.6 * u, e + 2.6 * u]]) gem(g, x, y, 2.3 * u, rar.color, rar.glow);
    crest(g, W / 2, e + 1.6 * u, (mini ? 5.4 : 4.6) * u, rar);
  }
  // Corner badge: flies, a building, lands anywhere
  const badge = badgeOf(card);
  if (badge) {
    const br = (mini ? 7.5 : 6.5) * u;
    const tab = opts.name && opts.level && !mini ? 12 * u : 0;
    drawCardBadge(g, badge, ax + aw - br - 1 * u, ay + br + 1 * u + tab, br);
  }
  // Rarity flourishes: studs on rare, sparkles on epic
  if (card.rarity === 'rare' || card.rarity === 'epic') {
    const col = card.rarity === 'epic' ? '#fff3ff' : '#fff1c4';
    for (const [x, y] of [[e + 2.5 * u, H - e - 2.5 * u], [W - e - 2.5 * u, H - e - 2.5 * u], [W - e - 2.5 * u, e + 2.5 * u]]) {
      g.fillStyle = INK;
      if (card.rarity === 'epic') {
        sparkle(g, x, y, 4.2 * u);
        g.fill();
        g.fillStyle = col;
        sparkle(g, x, y, 3.2 * u);
        g.fill();
      } else {
        g.beginPath();
        g.arc(x, y, 2.2 * u, 0, TAU);
        g.fill();
        g.fillStyle = col;
        g.beginPath();
        g.arc(x - 0.3 * u, y - 0.3 * u, 1.4 * u, 0, TAU);
        g.fill();
      }
    }
  }
  // Ribbon: the level (or the name, with the level on a corner tab)
  if (!mini && (opts.level || opts.name)) {
    const text = opts.name ? card.name : `Level ${opts.level}`;
    ribbon(g, 5 * u, H - 19 * u, W - 10 * u, 14 * u, rar, text, (opts.name ? 9.5 : 10) * u);
    if (opts.name && opts.level) {
      const tw = 24 * u;
      ribbon(g, W - tw - 4 * u, 4 * u, tw, 11 * u, rar, `Lv${opts.level}`, 8 * u);
    }
  }
  // Mana drop, top left over the frame
  const mr = (mini ? 13.5 : 10.5) * u; // bigger on hand cards: the cost is what you read there
  manaDrop(g, mr + 2.5 * u, mr * 1.45 + 1.5 * u, mr, card.mana);
  g.restore();
}

/**
 * Grey (locked) or dimmed (not enough mana) copy of a face, with blend modes
 * (no getImageData: reading pixels back from a GPU canvas stalls the frame):
 * desaturate by `grey`, darken by `dark`, lift the blue a touch, then keep
 * the face's own alpha.
 */
function tint(src, kind) {
  const cv = document.createElement('canvas');
  const w = (cv.width = src.width);
  const h = (cv.height = src.height);
  const g = cv.getContext('2d');
  const grey = kind === 'locked' ? 1 : 0.65;
  const dark = kind === 'locked' ? 0.62 : 0.58;
  const v = Math.round(255 * dark);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'saturation';
  g.globalAlpha = grey;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = `rgb(${v},${v},${v})`;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = `rgb(0,0,${kind === 'locked' ? 6 : 14})`;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-over';
  if (kind === 'locked') {
    const u = w / 100;
    padlock(g, w / 2, h * 0.44, 11 * u);
  }
  return cv;
}

function paletteKey(p) {
  return p ? `${p.body}${p.shade}${p.light}` : '';
}

/**
 * The cached face of a card at w x h device px (a canvas; don't draw on it).
 * Returns null for an unknown card or outside a browser.
 */
export function cardFace(cardId, w, h, opts = {}) {
  const card = CARDS[cardId];
  if (!card || typeof document === 'undefined') return null;
  w = Math.max(16, Math.round(w));
  h = Math.max(16, Math.round(h));
  const hats = opts.hats && card.unit ? opts.hats[card.unit] || '' : '';
  const base = `${cardId}|${w}x${h}|${opts.mini ? 1 : 0}|${opts.level || 0}|${opts.name ? 1 : 0}|${paletteKey(opts.palette)}|${hats}|${opts.team || ''}`;
  const mode = opts.locked ? 'locked' : opts.dim ? 'dim' : '';
  const key = base + '|' + mode;
  let cv = faces.get(key);
  if (cv) return cv;
  let src = faces.get(base + '|');
  if (!src) {
    src = document.createElement('canvas');
    src.width = w;
    src.height = h;
    paintFace(src, card, opts);
    remember(base + '|', src);
  }
  if (!mode) return src;
  cv = tint(src, mode);
  remember(key, cv);
  return cv;
}

function remember(key, cv) {
  if (faces.size >= MAX_FACES) faces.delete(faces.keys().next().value); // oldest first
  faces.set(key, cv);
}

/** Paint a card face onto `canvas` (filling it). Returns the canvas. */
export function drawCardArt(canvas, cardId, opts = {}) {
  if (!canvas) return canvas;
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  const face = cardFace(cardId, canvas.width, canvas.height, opts);
  if (face) g.drawImage(face, 0, 0);
  return canvas;
}

/** Forget cached faces (e.g. after the army colour or a hat changes). */
export function clearCardCache() {
  faces.clear();
  posed.clear();
}
