// The storyboard: "We Left Ben", announce trailer (2-4 player co-op).
//
// Cut to the game's title theme (assets/music/menu.mp3, 75 BPM: a bar every 3.2 s from 0.096 s).
// Its shape is the trailer's shape:
//   bars 0-2   quiet            cold open: Philadelphia, 2020; nobody sleeps; SLUMBRA
//   bar 3      the entrance     the safe room: WE LEFT HIM BEHIND.
//   bars 4-7   the build        HE KEEPS LEAVING SIGNS: his words, his drawing, his eyes
//   bars 8-9                   the squad of four, by name; 2-4 PLAYER CO-OP
//   bar 10                     a car with a red light (DINNER BELLS)
//   bar 11     the breath       THIS TIME, NOBODY GETS LEFT BEHIND.
//   bars 12-17 the climax       every map on the way to Pier 9, the specials, a revive, the ferry
//   bars 18-19 the fall         the logo; 2-4 PLAYER CO-OP; coming soon
//   bars 20-21 near silence     Ben has the last word
//
// A shot: { id, at, dur, level, seed, settings, prewarm (s simulated before its first frame),
//   director (false | 'quiet'), squad: { at, members, weapons }, setup(ctx), cues: [{ t, run(ctx) }]
//   (t on the film clock, from the cut; negative = during prewarm), update(ctx, lt, dt),
//   rate(lt) (slow motion), camera: { follow, offset, zoom, tilt, yaw, smooth, ease, shake } }.
// ctx: { game, take, lead (the lead survivor's autopilot), squad, rig, data }.

import { startle } from '../../src/game/witch.js';
import { openNear, decor, poster, alarmNear, middle, drowsers, horde, tankAt, hunterAt, witchAt, clearShot } from './staging.js';

export const BPM = 75;
export const BEAT = 60 / BPM;
const BAR0 = 0.096;
/** Film time of bar k (+ beats) of the title theme. */
export const bar = (k, beat = 0) => BAR0 + (k * 4 + beat) * BEAT;

/** Ben's chalk drawing of the squad on this map. */
const drawingOf = (g) => g.world.map.decor.find((q) => q.type === 'benchalk' && q.kind === 'drawing');

const END = 72.2; // the film's last frame (Ben's eyes close at 71.7)

const UP = -Math.PI / 2; // north: up the screen with the streets along it
const DOWN = Math.PI / 2;
const LEFT = Math.PI;
const RIGHT = 0;

/** Slow motion: `k` speed between a and b (film-local seconds), easing back to full speed over `ramp`. */
const slowmo = (a, b, k, ramp = 0.25) => (lt) => {
  if (lt < a - ramp || lt > b + ramp) return 1;
  if (lt < a) return 1 + (k - 1) * ((lt - (a - ramp)) / ramp);
  if (lt > b) return k + (1 - k) * ((lt - b) / ramp);
  return k;
};

// --- The shots ----------------------------------------------------------------------------------

const S = [];
const shot = (s) => S.push(s);

// Cold open. ------------------------------------------------------------------------------------

shot({ id: 'open', at: 0, dur: bar(1), black: true });

shot({
  id: 'drowse',
  at: bar(1),
  dur: bar(3) - bar(1),
  level: 'city',
  director: 'quiet',
  prewarm: 2,
  squad: { members: [] },
  setup(c) {
    drowsers(c, 1820, 2470, 46, 420, { squash: 0.6 });
  },
  camera: { follow: { from: { x: 1700, y: 2330 }, to: { x: 1930, y: 2470 } }, zoom: [1050, 560], tilt: [72, 44], ease: 'inOut' },
});

shot({
  id: 'slumbra',
  at: bar(3),
  dur: bar(3, 2) - bar(3),
  level: 'city',
  seed: 777, // (here the SLUMBRA poster hangs on a wall that faces the camera)
  director: 'quiet',
  prewarm: 1,
  squad: { at: (c) => ({ x: poster(c.game, 'slumbra').cx + 30, y: poster(c.game, 'slumbra').cy + 230, facing: UP }) },
  setup(c) {
    const p = poster(c.game, 'slumbra');
    c.data.p = p;
    drowsers(c, p.cx + 34, p.cy + 46, 1, 6, { face: DOWN });
    c.lead.set({ fire: false, face: UP - 0.25 });
  },
  update(c, lt) {
    // The beam drifts onto the poster.
    c.lead.set({ face: UP - 0.25 + Math.min(1, lt / 1.2) * 0.22 });
  },
  camera: (c) => ({ follow: { x: c.data.p.cx - 40, y: c.data.p.cy + 10 }, zoom: [230, 190], tilt: 38, lift: 60 }),
});

// We left him behind. -----------------------------------------------------------------------------

const ROOM = { x: 368, y: 3184 }; // the first safe room (city, seed 1337)

shot({
  id: 'saferoom',
  at: bar(3, 2),
  dur: bar(5) - bar(3, 2),
  level: 'city',
  director: false,
  prewarm: 0.5,
  squad: { at: { x: ROOM.x + 6, y: ROOM.y + 14, facing: UP }, offsets: { mags: [-56, 34], odile: [58, 30], lou: [2, 58] }, hold: true },
  setup(c) {
    c.lead.set({ fire: false, face: UP });
  },
  camera: { follow: { from: { x: ROOM.x, y: ROOM.y + 8 }, to: { x: ROOM.x, y: ROOM.y - 6 } }, zoom: [400, 268], tilt: [54, 64], ease: 'inOut' },
});

shot({
  id: 'sorry',
  at: bar(5),
  dur: bar(5, 2) - bar(5),
  level: 'city',
  director: 'quiet',
  prewarm: 0.5,
  squad: { at: (c) => ({ x: decor(c.game, 'SORRY BEN').x - 20, y: decor(c.game, 'SORRY BEN').y + 190, facing: UP }) },
  setup(c) {
    c.data.d = decor(c.game, 'SORRY BEN');
    c.lead.set({ fire: false, face: UP + 0.25 });
  },
  update(c, lt) {
    c.lead.set({ face: UP + 0.25 - Math.min(1, lt / 0.9) * 0.25 });
  },
  camera: (c) => ({ follow: { x: c.data.d.x, y: c.data.d.y + 40 }, zoom: [210, 186], tilt: 86, portraitZoom: 1.55 }),
});

shot({
  id: 'knows',
  at: bar(5, 2),
  dur: bar(6) - bar(5, 2),
  level: 'city',
  director: 'quiet',
  prewarm: 0.5,
  squad: { at: (c) => ({ x: decor(c.game, 'BEN KNOWS').x + 170, y: decor(c.game, 'BEN KNOWS').y + 150, facing: LEFT + 0.6 }) },
  setup(c) {
    c.data.d = decor(c.game, 'BEN KNOWS');
    c.lead.set({ fire: false, face: LEFT + 0.75 });
  },
  update(c, lt) {
    c.lead.set({ face: LEFT + 0.75 - Math.min(1, lt / 1.0) * 0.12 });
  },
  camera: (c) => ({ follow: { x: c.data.d.x + 10, y: c.data.d.y + 48 }, zoom: [200, 182], tilt: 66, portraitZoom: 1.9 }),
});

shot({
  id: 'drawing',
  at: bar(6),
  dur: bar(7) - bar(6),
  level: 'interior',
  director: false,
  prewarm: 1,
  squad: {
    at: (c) => {
      const d = drawingOf(c.game);
      return { x: d.x - 20, y: d.y - 92, facing: DOWN };
    },
    offsets: { mags: [128, -60], odile: [-104, -58], lou: [58, -110] },
    hold: true,
  },
  setup(c) {
    const d = drawingOf(c.game);
    c.data.d = d;
    c.lead.set({ fire: false, face: DOWN - 0.1 });
  },
  after(c) {
    // Everyone looks down at it.
    const d = c.data.d;
    for (const a of c.game.allies) {
      if (a.target) continue;
      a.facing = Math.atan2(d.y - a.y, d.x - a.x);
      a.aimAngle = a.facing;
    }
  },
  camera: (c) => ({ follow: { x: c.data.d.x + 8, y: c.data.d.y - 34 }, zoom: [340, 300], tilt: [72, 66] }),
});

shot({
  id: 'glimpse',
  at: bar(7),
  dur: bar(8) - bar(7),
  level: 'city',
  director: false,
  prewarm: 0.5,
  squad: { at: (c) => ({ x: c.game.ben.glimpse.x + 300, y: c.game.ben.glimpse.y + 60, facing: LEFT }) },
  setup(c) {
    const g = c.game.ben.glimpse;
    c.data.g = g;
    const p = c.game.player;
    c.data.at = Math.atan2(g.y - p.y, g.x - p.x);
    c.lead.set({ fire: false, face: c.data.at - 0.55 });
  },
  update(c, lt) {
    // The beam drifts... and finds them on the third beat.
    const k = Math.min(1, Math.max(0, (lt - 1.45) / 0.55));
    c.lead.set({ face: c.data.at - 0.55 * (1 - k * k * (3 - 2 * k)) });
  },
  camera: (c) => ({ follow: { x: c.data.g.x + 70, y: c.data.g.y + 10 }, zoom: [260, 230], tilt: 62 }),
});

// The squad. ------------------------------------------------------------------------------------------

shot({
  id: 'squad',
  at: bar(8),
  dur: bar(10) - bar(8),
  level: 'city',
  director: 'quiet',
  prewarm: 1.5,
  squad: { at: { x: 2520, y: 2924, facing: RIGHT } },
  setup(c) {
    c.lead.set({ goal: { x: 3070, y: 2924 }, speed: 0.5, fire: true });
    for (const a of c.game.allies) a.spotSide = 34;
  },
  camera: (c) => ({ follow: 'squad', offset: [70, 6], smooth: 2.5, zoom: [300, 262], tilt: [58, 62] }),
});

// A car with a red light. --------------------------------------------------------------------------

shot({
  id: 'alarm',
  at: bar(10),
  dur: bar(12) - bar(10),
  level: 'city',
  director: true,
  prewarm: 1,
  squad: { at: (c) => ({ x: decor(c.game, 'DINNER BELLS').x + 160, y: decor(c.game, 'DINNER BELLS').y + 40, facing: LEFT + 0.5 }), members: ['lou', 'teo', 'mags', 'odile'] },
  setup(c) {
    const car = alarmNear(c.game, 1584, 2160);
    c.data.car = car;
    c.lead.set({ fire: false, face: LEFT + 0.5 });
  },
  cues: [
    { t: 0.55, run: (c) => c.lead.set({ aimAt: middle(c.data.car), fire: false }) },
    { t: 1.45, run: (c) => c.lead.set({ aimAt: null, fire: true }) },
  ],
  camera: { follow: { x: 1610, y: 2230 }, zoom: [330, 300], tilt: 54 },
});

// The climax. ------------------------------------------------------------------------------------

shot({
  id: 'drop',
  at: bar(12),
  dur: bar(13) - bar(12),
  level: 'city',
  prewarm: 3.2,
  settings: { hordeSize: 5 },
  squad: { at: (c) => ({ ...openNear(c.game, 3107, 805, 120), facing: UP }) },
  setup(c) {
    const p = c.game.player;
    horde(c, p.x, p.y, 150, 380, 900, 6, 1.2);
  },
  cues: [{ t: -2.6, run: (c) => c.game.director.forceMob() }, { t: -1.2, run: (c) => c.game.director.forceMob() }],
  rate: slowmo(0, 0.55, 0.3, 0.45),
  camera: { follow: 'squad', smooth: 3, zoom: [430, 300], tilt: [46, 42] },
});

shot({
  id: 'icecream',
  at: bar(13),
  dur: bar(14) - bar(13),
  level: 'suburbia',
  prewarm: 2.5,
  settings: { hordeSize: 4 },
  squad: { at: (c) => ({ ...openNear(c.game, 4032, 2600, 70, 600), facing: UP }), members: ['mags', 'teo', 'odile', 'lou'] },
  setup(c) {
    const truck = alarmNear(c.game, 4032, 2450, true);
    c.data.truck = truck;
    const p = c.game.player;
    horde(c, p.x, p.y, 110, 360, 800, 5, 1.0);
  },
  cues: [
    { t: 0.0, run: (c) => c.lead.set({ aimAt: middle(c.data.truck) }) },
    { t: 0.5, run: (c) => c.lead.set({ aimAt: null }) },
  ],
  camera: (c) => ({ follow: { x: (c.data.truck.x + c.data.truck.w / 2 + c.game.player.x) / 2, y: (c.data.truck.y + c.game.player.y) / 2 + 20 }, smooth: 2, zoom: [400, 370], tilt: 50 }),
});

shot({
  id: 'graveyard',
  at: bar(14),
  dur: bar(14, 2) - bar(14),
  level: 'graveyard',
  prewarm: 3,
  settings: { hordeSize: 4 },
  squad: { at: (c) => ({ ...openNear(c.game, 2400, 1700, 70, 900), facing: UP }) },
  setup(c) {
    const p = c.game.player;
    horde(c, p.x, p.y, 120, 380, 850, 5, 1.0);
  },
  camera: { follow: 'squad', smooth: 3, zoom: [380, 350], tilt: 48 },
});

shot({
  id: 'junkyard',
  at: bar(14, 2),
  dur: bar(15) - bar(14, 2),
  level: 'junkyard',
  prewarm: 3,
  settings: { hordeSize: 4 },
  squad: { at: (c) => ({ ...openNear(c.game, 2500, 1350, 80, 700), facing: UP }) },
  setup(c) {
    const p = c.game.player;
    horde(c, p.x, p.y, 120, 360, 800, 5, 1.0);
  },
  camera: { follow: 'squad', smooth: 3, zoom: [360, 330], tilt: 46 },
});

shot({
  id: 'tank',
  at: bar(15),
  dur: bar(16) - bar(15),
  level: 'city',
  prewarm: 1.2,
  settings: { hordeSize: 2 },
  squad: { at: (c) => ({ ...openNear(c.game, 4300, 1400, 120, 900), facing: RIGHT }), members: ['lou', 'teo', 'mags', 'odile'] },
  setup(c) {
    const p = c.game.player;
    c.data.tank = tankAt(c, p.x + 320, p.y - 20);
    horde(c, p.x, p.y, 40, 400, 800, 3, 1.0);
  },
  rate: slowmo(1.1, 1.9, 0.28, 0.3),
  camera: (c, lt) => {
    const t = c.data.tank;
    const lou = c.game.player;
    // The swing: the two of them. After it: Lou, flying.
    const f = t && t.alive && lt < 1.25 ? { x: (t.x + lou.x) / 2, y: (t.y + lou.y) / 2 } : { x: lou.x + 40, y: lou.y };
    return { follow: f, smooth: 3.5, zoom: [300, 340], tilt: 42 };
  },
});

shot({
  id: 'hunter',
  at: bar(16),
  dur: bar(16, 3) - bar(16),
  level: 'city',
  prewarm: 0.6,
  settings: { hordeSize: 1 },
  squad: { at: (c) => ({ ...openNear(c.game, 3107, 805, 200), facing: UP }), offsets: { mags: [-150, 70], odile: [-190, -40], lou: [-120, 160] }, hold: true },
  setup(c) {
    const p = c.game.player;
    const at = clearShot(c.game, p.x, p.y, 250, -0.75);
    const h = hunterAt(c, at.x, at.y);
    h.hp = h.maxHp = 3000; // (so the squad can't drop it before it jumps)
    h.onHit = () => {}; // (nor knock it out of its crouch)
    c.data.slow = slowmo(0.42, 0.72, 0.35, 0.15);
    h.pounceCd = 0.15;
    c.data.h = h;
    c.lead.set({ fire: false, shove: false, face: UP });
  },
  rate: (lt, c) => c.data.slow(lt),
  camera: { follow: 'lead', offset: [10, -20], smooth: 4, zoom: [350, 310], tilt: 52 },
});

shot({
  id: 'witch',
  at: bar(16, 3),
  dur: bar(17) - bar(16, 3),
  level: 'graveyard',
  director: false,
  prewarm: 0.6,
  squad: { at: (c) => ({ ...openNear(c.game, 3200, 1300, 90, 900), facing: UP }) },
  setup(c) {
    const p = c.game.player;
    c.data.w = witchAt(c, p.x + 30, p.y - 210, DOWN);
    c.lead.set({ fire: false, face: Math.atan2(c.data.w.y - p.y, c.data.w.x - p.x) });
  },
  cues: [{ t: 0, run: (c) => startle(c.game, c.data.w, c.game.player) }],
  camera: (c) => ({ follow: { x: c.data.w.x, y: c.data.w.y + 60 }, smooth: 3, zoom: [250, 230], tilt: 54 }),
});

shot({
  id: 'revive',
  at: bar(17),
  dur: bar(17, 2) - bar(17),
  level: 'docks',
  prewarm: 2.2,
  settings: { hordeSize: 3 },
  squad: { at: (c) => ({ ...openNear(c.game, 1500, 2300, 170, 1400), facing: UP }) },
  setup(c) {
    const o = c.take.who('odile');
    o.mayFall = true;
    const p = c.game.player;
    horde(c, p.x, p.y, 70, 380, 800, 4, 1.0);
  },
  cues: [
    { t: -2.15, run: (c) => c.game.hurtAlly(999, null, { knock: 0 }, c.take.who('odile')) },
    { t: -2.1, run: (c) => c.lead.set({ goal: c.take.who('odile'), arrive: 20, fire: false }) },
  ],
  camera: (c) => ({ follow: c.take.who('odile'), smooth: 5, zoom: [260, 240], tilt: 56 }),
});

shot({
  id: 'pier',
  at: bar(17, 2),
  dur: bar(18) - bar(17, 2),
  level: 'docks',
  prewarm: 14,
  settings: { hordeSize: 3, ferryTime: 10 },
  squad: { at: (c) => ({ x: c.game.events.finale.use.x, y: c.game.events.finale.use.y, facing: RIGHT }) },
  setup(c) {
    const F = c.game.events.finale;
    c.data.F = F;
  },
  cues: [
    { t: -3.2, run: (c) => horde(c, c.game.player.x, c.game.player.y, 90, 420, 1000, 4, 0.8) },
    { t: -1.5, run: (c) => c.lead.set({ goal: { x: c.data.F.gangX, y: c.data.F.pier.y + c.data.F.pier.h / 2 }, fire: true }) },
  ],
  camera: (c) => ({ follow: 'squad', smooth: 3, zoom: [420, 380], tilt: 46 }),
});

// The logo, and Ben. ----------------------------------------------------------------------------------

shot({ id: 'logo', at: bar(18), dur: bar(20) - bar(18), black: true });
shot({ id: 'ben', at: bar(20), dur: END - bar(20), black: true });

// --- Words ------------------------------------------------------------------------------------------

const CARDS_FULL = [
  { kind: 'type', text: 'PHILADELPHIA · 2020', at: 0.55, dur: 2.6, y: 0.53, align: 'center', size: 0.05, cps: 14 },
  { kind: 'title', text: 'NOBODY SLEEPS ANYMORE.', at: bar(1, 2), dur: bar(3) - bar(1, 2) - 0.15, y: 0.79, size: 0.075 },
  { kind: 'title', text: 'WE LEFT HIM BEHIND.', at: bar(4), dur: bar(5) - bar(4) - 0.1, size: 0.11, y: 0.8 },
  { kind: 'title', text: 'HE KEEPS LEAVING SIGNS.', at: bar(5, 0.4), dur: bar(6) - bar(5, 0.4) - 0.1, size: 0.11, y: 0.8 },
  { kind: 'tag', who: 'teo', name: 'TEO', line: 'says he can hotwire it', at: bar(8, 1), dur: 3.6, dir: [1, -1] },
  { kind: 'tag', who: 'mags', name: 'MAGS', line: "he can't", at: bar(8, 2), dur: 3.0, dir: [-1, -1] },
  { kind: 'tag', who: 'odile', name: 'ODILE', line: 'writes it all down', at: bar(9, 0), dur: 2.5, dir: [1, 1] },
  { kind: 'tag', who: 'lou', name: 'LOU', line: 'counts generously', at: bar(9, 1), dur: 2.4, dir: [-1, 1] },
  { kind: 'kicker', text: '2–4 PLAYER CO-OP', at: bar(9, 2.5), dur: bar(10) - bar(9, 2.5) - 0.05, y: 0.84, size: 0.04, rules: true },
  { kind: 'title', text: 'THIS TIME,', at: bar(11, 0.1), dur: 1.35, size: 0.1, y: 0.44 },
  { kind: 'title', text: 'NOBODY GETS LEFT BEHIND.', at: bar(11, 1.9), dur: bar(12) - bar(11, 1.9) - 0.05, size: 0.12, y: 0.46, fin: 0.2, fout: 0.05 },
  { kind: 'crayon', text: 'promise?', at: bar(11, 3.0), dur: bar(12) - bar(11, 3.0) - 0.05, x: 0.7, y: 0.62, size: 0.075, cps: 12, fout: 0.05 },
  { kind: 'type', text: 'CENTER CITY', at: bar(12, 0.6), dur: 2.3, x: 0.05, y: 0.92, size: 0.03 },
  { kind: 'type', text: 'DELCO', at: bar(13, 0.4), dur: 2.6, x: 0.05, y: 0.92, size: 0.03 },
  { kind: 'type', text: 'WISSAHICKON HILL', at: bar(14, 0.2), dur: 1.35, x: 0.05, y: 0.92, size: 0.03, cps: 24 },
  { kind: 'type', text: 'SOUTHWEST PHILLY', at: bar(14, 2.2), dur: 1.35, x: 0.05, y: 0.92, size: 0.03, cps: 24 },
  { kind: 'title', text: 'NO TWO NIGHTS THE SAME.', at: bar(14, 0.15), dur: bar(15) - bar(14, 0.15) - 0.1, size: 0.08, y: 0.15, fin: 0.15, fout: 0.15 },
  { kind: 'type', text: 'PIER 9', at: bar(17, 2.2), dur: 1.4, x: 0.05, y: 0.92, size: 0.03 },
  { kind: 'logo', at: bar(18) + 0.05, dur: bar(20) - bar(18) - 0.35 },
  { kind: 'kicker', text: '2–4 PLAYER CO-OP', at: bar(18, 2), dur: bar(20) - bar(18, 2) - 0.35, y: 0.79, size: 0.038, rules: true },
  { kind: 'kicker', text: 'OUT NOW · DOWNLOAD FREE', at: bar(19), dur: bar(20) - bar(19) - 0.35, y: 0.87, size: 0.03, weight: 600, tracking: 0.3, color: 'rgba(243,234,215,0.8)' },
  { kind: 'crayon', text: 'bring your friends.', at: bar(20, 1), dur: 71.7 - bar(20, 1), y: 0.4, size: 0.085, cps: 10, fout: 0.04 },
  { kind: 'crayon', text: "i'll count them.", at: bar(21, 0.5), dur: 71.7 - bar(21, 0.5), y: 0.56, size: 0.085, cps: 9, fout: 0.04 },
  { kind: 'eyes', at: 69.55, dur: 71.7 - 69.55, y: 0.76, size: 0.032, blink: 1.45 },
];

const FX_FULL = {
  // Bars on for "the film", off when the climax hits (the film becomes the game).
  letterbox: [[0, 0.125], [bar(12) - 0.01, 0.125], [bar(12), 0]],
  black: [[bar(11) - 0.02, 0], [bar(11), 0.78], [bar(12) - 0.01, 0.86], [bar(12), 0]],
  flash: [{ at: bar(12), dur: 0.45, k: 0.95 }, { at: bar(18), dur: 0.6, k: 0.7 }],
};

// --- Sound -------------------------------------------------------------------------------------------

const MUSIC_FULL = [{ cue: 'menu', at: 0, from: 0, dur: 71.75, fadeOut: 1.9, gain: 1 }];

/** The mix: music and the game's sound, ramped between these levels. */
const MIX_FULL = [
  { at: 0, music: 1, game: 0 },
  { at: bar(1), game: 0.0 },
  { at: bar(1) + 0.6, game: 0.55 },
  { at: bar(10), game: 0.75 },
  { at: bar(11) - 0.2, game: 0.75 },
  // The held breath: the alarm and the horde go distant under the words...
  { at: bar(11) + 0.5, game: 0.26 },
  { at: bar(12) - 0.03, game: 0.3 },
  // ...and slam back with the climax.
  { at: bar(12), game: 0.95 },
  { at: bar(18), game: 0.95 },
  { at: bar(19), game: 0.6 },
  { at: bar(20), game: 0.9 },
];

/** Sounds that belong to the film, not a shot. */
const SFX_FULL = [
  { at: bar(12) - 0.05, run: (a) => a.alarmStop() }, // (the car alarm would wail on into the climax)
  { at: bar(14) - 0.03, run: (a) => a.alarmStop() }, // (and the ice-cream truck's tune into the graveyard)
  { at: bar(18) + 0.02, run: (a) => a.explosion(a.listener.x, a.listener.y) },
  { at: bar(20, 0.4), run: (a) => a.benWhistle(a.listener.x + 120, a.listener.y - 40) },
];

// --- Cuts ---------------------------------------------------------------------------------------------

const FULL = { film: S, duration: END, cards: CARDS_FULL, fx: FX_FULL, music: MUSIC_FULL, mix: MIX_FULL, sfx: SFX_FULL };

/** The part of a cut between film times a and b, moved to start at `to`. */
function excerpt(cut, a, b, to = 0) {
  const d = to - a;
  const inside = (t) => t >= a - 1e-6 && t < b - 1e-6;
  const keys = (list) => (list || []).filter(([t]) => inside(t)).map(([t, v]) => [t + d, v]);
  return {
    film: cut.film.filter((s) => inside(s.at)).map((s) => ({ ...s, at: s.at + d })),
    cards: cut.cards.filter((c) => inside(c.at)).map((c) => ({ ...c, at: c.at + d, dur: Math.min(c.dur, b - c.at) })),
    fx: { letterbox: keys(cut.fx.letterbox), black: keys(cut.fx.black), flash: (cut.fx.flash || []).filter((f) => inside(f.at)).map((f) => ({ ...f, at: f.at + d })) },
    mix: cut.mix.filter((k) => inside(k.at)).map((k) => ({ ...k, at: k.at + d })),
    sfx: cut.sfx.filter((k) => inside(k.at)).map((k) => ({ ...k, at: k.at + d })),
  };
}

/**
 * The 30-second cut: no logo, no title and no murals (the walls and streets carry no words). A
 * dateline, a car with a red light, the held breath (THIS TIME, NOBODY GETS LEFT BEHIND.), the whole
 * climax, then a card: 2-4 PLAYER CO-OP / bring your friends. / DOWNLOAD FREE NOW. The music is the
 * same stretch of the title theme (bars 10 to 19).
 */
function thirty() {
  const A = bar(10);
  const B = bar(18);
  const E = B - A; // the end card starts where the climax stops (25.6 s)
  const LEN = 30;
  const x = excerpt(FULL, A, B);
  x.film = x.film.map((s) => ({ ...s, murals: false }));
  x.film.push({ id: 'end', at: E, dur: LEN - E, black: true });
  x.cards.unshift({ kind: 'type', text: 'PHILADELPHIA · 2020', at: 0.3, dur: 2.7, x: 0.05, y: 0.945, size: 0.028, cps: 16 });
  x.cards.push(
    { kind: 'title', text: '2–4 PLAYER CO-OP', at: E + 0.03, dur: LEN - 0.3 - E, size: 0.12, y: 0.36, pop: true, fin: 0.06, fout: 0.05 },
    { kind: 'crayon', text: 'bring your friends.', at: E + 0.9, dur: LEN - 0.3 - (E + 0.9), y: 0.53, size: 0.08, cps: 11, fout: 0.05 },
    { kind: 'cta', text: 'DOWNLOAD FREE NOW', at: E + 1.75, dur: LEN - 0.3 - (E + 1.75), y: 0.72, size: 0.052, fout: 0.05 },
  );
  // The bars and the breath came from the full cut; the climax and the end card each open on a flash.
  x.fx.letterbox.unshift([0, 0.125]);
  x.fx.flash.push({ at: E, dur: 0.6, k: 0.7 });
  x.mix.unshift({ at: 0, music: 1, game: 0.75 });
  x.mix.push({ at: E, game: 0.95 }, { at: E + 3.2, game: 0.6 });
  x.sfx.push(
    { at: E + 0.02, run: (a) => a.explosion(a.listener.x, a.listener.y) },
    { at: E + 0.8, run: (a) => a.benWhistle(a.listener.x + 120, a.listener.y - 40) },
  );
  return { ...x, duration: LEN, music: [{ cue: 'menu', at: 0, from: A, dur: LEN, fadeIn: 0.08, fadeOut: 1.1, gain: 1 }] };
}

const CUTS = { full: () => FULL, 30: thirty };

/** Which cut this page plays: ?cut=30 for the 30-second one, the full trailer otherwise. */
export const CUT = (() => {
  const want = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cut') : null;
  return want && CUTS[want] ? want : 'full';
})();
const C = CUTS[CUT]();

export const FILM = C.film;
export const DURATION = C.duration;
export const CARDS = C.cards;
export const FX = C.fx;
export const MUSIC = C.music;
export const MIX = C.mix;
export const SFX = C.sfx;
