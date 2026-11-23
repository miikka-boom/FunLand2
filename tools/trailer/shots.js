// The trailer's shots, filmed by capture.cjs on the stage (stage.js).
//
// Each shot: a level and seed, settings, how long, and a script. setup() puts
// people and infected in place; tick() runs every frame before the game does
// (t = seconds into the shot). Player one ("YOU", blue) is driven by the pilot,
// player two ("SAM", green) is the game's own teammate AI, which already plays
// like a friend would: it follows, covers you, pulls a Hunter off you, goes
// down and needs picking up.
//
// Most shots use the game's isometric 3D camera (the "Streets along the
// screen" switch off) and a darker night than the default, for the trailer.

import { shot } from './stage.js';

const ISO = (tilt = 40) => ({ cameraAligned: false, cameraTilt: tilt });
const TOP = (tilt = 70) => ({ cameraAligned: true, cameraAlignedTilt: tilt });
// Streets, with the gas station, the crashed helicopter and the checkpoint (seed 1337).
const CITY = { ally: true, landmarks: true, darkness: 0.75 };
const mid = (a, b, k = 0.5) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });

// --- Cold open: your friend pulls a Hunter off you -------------------------------------------

shot({
  name: 'hunter_save',
  level: 'city',
  seed: 1337,
  rng: 11,
  seconds: 9,
  camera: ISO(40),
  settings: { ...CITY, specials: true },
  setup(S, T) {
    const g = S.game;
    S.calm();
    S.clear(2420, 2250, 1000);
    S.place(g.player, 2430, 2250, Math.PI);
    S.place(g.ally, 2250, 2290, Math.PI);
    T.hold = { x: 2250, y: 2290 };
    S.crowd(1990, 2250, 9, 70, true);
    T.h = S.spawnHunter(g, 2800, 2236);
    T.h.hp = 5000;
    T.h.pounceCd = 2.4;
    S.pilot.autoAim = true;
    S.pilot.autoRange = 560;
    S.pilot.filter = (z) => z.type !== 'hunter';
    S.cam.zoom = 320;
    S.cam.mode = 'track';
    S.cam.k = 3;
    S.cam.target = () => mid(g.player, T.h.alive ? T.h : g.ally, 0.3);
    S.snapCamera(2500, 2245);
  },
  tick(S, t, k, T) {
    const g = S.game;
    const p = g.player;
    if (p.hp < 60) p.hp = 60;
    if (!T.pinned && p.pinnedBy) {
      T.pinned = true;
      T.pinT = t;
      S.note('pin');
    }
    if (T.pinned && !T.freed && !p.pinnedBy) {
      T.freed = true;
      S.note('freed');
      T.h.hp = Math.min(T.h.hp, 130);
      S.pilot.filter = null;
    }
  },
  post(S, t, k, T) {
    // Sam is up the street covering the front when it lands, and takes a moment to get back.
    const a = S.game.ally;
    if (!T.freed && (!T.pinned || t - T.pinT < 0.6)) {
      a.x = T.hold.x;
      a.y = T.hold.y;
      a.vx = 0;
      a.vy = 0;
      a.stuckT = 0; // held on purpose: don't let it think it's lost and warp
      a.checkT = 0.5;
    }
  },
});

// --- Two flashlights leave the first safe room ------------------------------------------------

shot({
  name: 'saferoom',
  level: 'city',
  seed: 1337,
  rng: 3,
  seconds: 7,
  camera: TOP(68),
  settings: { ...CITY },
  setup(S, T) {
    const g = S.game;
    S.calm();
    S.place(g.player, 352, 3150, 0);
    S.place(g.ally, 300, 3215, 0);
    S.cam.zoom = (t) => 300 + Math.min(1, t / 7) * 60;
    S.cam.mode = 'track';
    S.cam.k = 2.2;
    S.cam.target = (t) => (t < 2.2 ? { x: 368, y: 3184 } : { x: Math.max(368, g.player.x - 60), y: 3184 });
    S.snapCamera(368, 3184);
  },
  tick(S, t) {
    const g = S.game;
    if (t > 1.6 && !S.pilot.goal) {
      S.pilot.goal = { x: 760, y: 3184 };
      S.pilot.speed = 0.6;
    }
    S.tags.alpha = Math.min(1, Math.max(0, (t - 0.6) / 0.6));
  },
});

// --- Two phones, one night (filmed twice: through each survivor's camera) --------------------

shot({
  name: 'phones',
  level: 'city',
  seed: 1337,
  rng: 5,
  seconds: 6,
  views: 2,
  sticks: true,
  camera: ISO(40),
  settings: { ...CITY },
  hud: { threats: false, objective: true, panels: true, marker: false, buttons: true, sticks: true, bars: false, pinned: false, messages: false, end: false },
  altHud: { threats: false, objective: true, panels: false, marker: false, buttons: true, sticks: true, bars: false, pinned: false, messages: false, end: false },
  setup(S, T) {
    const g = S.game;
    S.calm();
    S.clear(2600, 2250, 1200);
    S.place(g.player, 2640, 2235, 0);
    S.place(g.ally, 2560, 2270, Math.PI);
    S.crowd(3020, 2240, 10, 70, true);
    S.crowd(2180, 2250, 10, 70, true);
    S.pilot.autoAim = true;
    S.pilot.autoRange = 600;
    S.pilot.filter = (z) => z.x > g.player.x - 30;
    S.snapCamera(2660, 2235);
  },
  tick(S, t, k, T) {
    const g = S.game;
    if (k === 25 || k === 70 || k === 115) {
      g.director.queueGroup({ x: 3060, y: 2245 }, 8, 1.2);
      g.director.queueGroup({ x: 2150, y: 2255 }, 8, 1.2);
    }
  },
});

// --- "HERE THEY COME!": back to back at a crossroads -----------------------------------------

shot({
  name: 'horde',
  level: 'city',
  seed: 1337,
  rng: 21,
  seconds: 9,
  camera: ISO(35),
  settings: { ...CITY },
  setup(S, T) {
    const g = S.game;
    S.calm();
    S.clear(2887, 2250, 1300);
    S.place(g.player, 2887, 2222, -Math.PI / 2);
    S.place(g.ally, 2887, 2282, Math.PI / 2);
    S.cam.mode = 'fixed';
    S.cam.x = 2887;
    S.cam.y = 2250;
    S.cam.zoom = (t) => 560 - Math.min(1, t / 9) * 90;
    S.snapCamera(2887, 2250);
    S.pilot.autoAim = true;
    S.pilot.autoRange = 620;
    S.pilot.filter = (z) => z.y < g.player.y + 20;
  },
  tick(S, t, k, T) {
    const g = S.game;
    if (k === 15) {
      S.mob(2887, 1840, 22, 2.6);
      S.note('mob');
    }
    if (k === 30) g.director.queueGroup({ x: 2887, y: 2700 }, 16, 2.6);
    if (k === 60) g.director.queueGroup({ x: 3320, y: 2250 }, 10, 2);
    if (k === 75) g.director.queueGroup({ x: 2450, y: 2250 }, 10, 2);
    // Back to back: both hold the crossroads.
    S.pilot.goal = { x: 2887, y: 2222 };
    if (g.player.hp < 55) g.player.hp = 55;
    if (g.ally.hp < 40) g.ally.hp = 40;
  },
});

// --- Pick each other up: Sam goes down by a burning car --------------------------------------

shot({
  name: 'revive',
  level: 'city',
  seed: 1337,
  rng: 8,
  seconds: 8.5,
  camera: ISO(45),
  settings: { ...CITY },
  setup(S, T) {
    const g = S.game;
    S.calm();
    S.clear(2100, 2450, 900);
    S.ALLY.reviveTime = 2.4;
    S.place(g.ally, 2105, 2455, Math.PI / 2);
    S.place(g.player, 2160, 2235, Math.PI / 2);
    S.crowd(2110, 2600, 5, 40, true);
    S.cam.zoom = 290;
    S.cam.mode = 'track';
    S.cam.k = 2.5;
    S.cam.target = () => mid(g.ally, g.player, 0.35);
    S.snapCamera(2120, 2390);
    S.hurtAlly(g, 300, { x: 2105, y: 2520 });
    S.note('down');
    S.pilot.autoAim = true;
    S.pilot.autoRange = 520;
    S.pilot.goal = { x: 2150, y: 2330 };
  },
  tick(S, t, k, T) {
    const g = S.game;
    const a = g.ally;
    const left = g.zombies.filter((z) => z.alive && z.state !== 'idle' && Math.hypot(z.x - a.x, z.y - a.y) < 300).length;
    if (!T.go && (t > 2.2 || (t > 1.2 && left === 0))) {
      T.go = true;
      S.pilot.autoAim = false;
      S.pilot.goal = { x: a.x + 30, y: a.y - 26 };
      S.note('run');
    }
    if (T.go && !a.down && !T.up) {
      T.up = true;
      S.note('up');
    }
    if (T.up) {
      S.pilot.goal = { x: 2160, y: 2700 };
      S.pilot.speed = 0.5;
    }
  },
});

// --- Don't wake her. (Sam woke her.) ----------------------------------------------------------

shot({
  name: 'witch',
  level: 'city',
  seed: 1337,
  rng: 4,
  seconds: 10,
  camera: ISO(40),
  settings: { ...CITY, witchHealth: 1 },
  setup(S, T) {
    const g = S.game;
    S.calm();
    const w = g.witches[0];
    T.w = w;
    S.clear(w.x, w.y, 900);
    // Walk past her, wide, flashlights forward (never on her).
    T.from = { x: w.x - 330, y: w.y - 150 };
    T.to = { x: w.x + 360, y: w.y - 150 };
    S.place(g.player, T.from.x + 70, T.from.y, 0);
    S.place(g.ally, T.from.x, T.from.y + 30, 0);
    S.pilot.goal = T.to;
    S.pilot.speed = 0.42;
    S.pilot.aim = { x: T.to.x + 400, y: T.to.y - 120 };
    S.cam.zoom = 320;
    S.cam.mode = 'track';
    S.cam.k = 2;
    S.cam.target = () => mid(w, mid(g.player, g.ally), 0.55);
    S.snapCamera(w.x - 120, w.y - 90);
  },
  tick(S, t, k, T) {
    const g = S.game;
    const w = T.w;
    if (k === Math.round(4.6 * 30)) {
      S.startle(g, w, g.ally);
      S.note('startle');
    }
    if (k % 15 === 0) S.note(`witch ${w.mode} hp=${w.hp | 0}`);
    if (t > 4.6 && t < 5.3) {
      // Startled: a step back, no shooting yet.
      S.pilot.aim = null;
      S.pilot.goal = { x: g.player.x - 30, y: g.player.y - 30 };
    }
    if (t > 5.3 && !T.fight) {
      T.fight = true;
      S.pilot.aim = null;
      S.pilot.autoAim = true;
      S.pilot.autoRange = 600;
      S.pilot.goal = { x: g.player.x - 10, y: g.player.y - 20 };
    }
  },
});

// --- The red light means don't. Someone did. ------------------------------------------------

shot({
  name: 'alarm',
  level: 'city',
  seed: 1337,
  rng: 9,
  seconds: 7,
  camera: ISO(40),
  settings: { ...CITY },
  setup(S, T) {
    const g = S.game;
    S.calm();
    const car = g.world.map.obstacles.find((o) => o.alarm && Math.abs(o.x - 1502) < 5 && Math.abs(o.y - 2283) < 5);
    T.car = car;
    const cx = car.x + car.w / 2;
    const cy = car.y + car.h / 2;
    S.clear(cx, cy, 900);
    S.place(g.player, cx + 250, cy - 40, Math.PI);
    S.place(g.ally, cx + 300, cy + 20, Math.PI);
    T.z = S.zombie(cx + 10, cy - 46, false);
    S.cam.zoom = 330;
    S.cam.mode = 'fixed';
    S.cam.x = cx + 110;
    S.cam.y = cy - 10;
    S.snapCamera(cx + 110, cy - 10);
  },
  tick(S, t, k, T) {
    const g = S.game;
    const car = T.car;
    const cx = car.x + car.w / 2;
    const cy = car.y + car.h / 2;
    if (t > 0.9 && t < 2.2) {
      // Spray at the drowser by the car...
      S.pilot.aim = { x: cx - 4, y: cy - 8 };
      S.pilot.fire = true;
    } else {
      S.pilot.fire = false;
      S.pilot.aim = null;
      S.pilot.autoAim = t >= 2.2;
    }
    if (!T.on && car.alarmOn) {
      T.on = true;
      S.note('alarm');
    }
  },
});

// --- The Tank ----------------------------------------------------------------------------------

shot({
  name: 'tank',
  level: 'city',
  seed: 1337,
  rng: 13,
  seconds: 9,
  camera: ISO(35),
  settings: { ...CITY, specials: true, tankHealth: 1.7 },
  setup(S, T) {
    const g = S.game;
    S.calm();
    S.clear(2600, 2250, 1300);
    S.place(g.player, 2520, 2230, 0);
    S.place(g.ally, 2470, 2275, 0);
    T.tank = S.spawnTank(g, 2980, 2250);
    g.director.tank = T.tank;
    S.pilot.aim = T.tank;
    S.pilot.fire = true;
    S.pilot.goal = { x: 2150, y: 2240 };
    S.pilot.speed = 0.55;
    S.cam.zoom = (t) => 520 - Math.min(1, t / 9) * 60;
    S.cam.mode = 'track';
    S.cam.k = 2.5;
    S.cam.target = () => mid(g.player, T.tank, 0.42);
    S.snapCamera(2700, 2240);
  },
  tick(S, t, k, T) {
    const g = S.game;
    S.pilot.fire = t > 0.8;
    if (g.player.hp < 50) g.player.hp = 50;
    if (g.ally.hp < 30 && !g.ally.down) g.ally.hp = 30;
    if (k % 30 === 0) S.note(`tank ${T.tank.mode} hp=${T.tank.hp | 0}`);
    if (!T.tank.alive && !T.dead) {
      T.dead = true;
      S.note('tank dead');
    }
  },
});

// --- The gas station ----------------------------------------------------------------------------

shot({
  name: 'gas_station',
  level: 'city',
  seed: 1337,
  rng: 17,
  seconds: 7,
  camera: ISO(35),
  settings: { ...CITY },
  setup(S, T) {
    const g = S.game;
    S.calm();
    const st = g.events.explosives.find((e) => e.id === 'station');
    T.st = st;
    T.pump = st.parts[0];
    S.clear(st.x, st.y, 1300);
    S.place(g.player, st.x - 400, st.y - 30, 0);
    S.place(g.ally, st.x - 440, st.y + 40, 0);
    S.crowd(st.x + 330, st.y, 26, 120, true);
    S.pilot.autoAim = true;
    S.pilot.autoRange = 380;
    S.cam.zoom = 600;
    S.cam.mode = 'fixed';
    S.cam.x = st.x - 170;
    S.cam.y = st.y;
    S.snapCamera(st.x - 170, st.y);
  },
  tick(S, t, k, T) {
    const g = S.game;
    const pump = T.pump;
    if (t > 2.3 && !T.st.done) {
      S.pilot.autoAim = false;
      S.pilot.aim = { x: pump.x + pump.w / 2, y: pump.y + pump.h / 2 };
      S.pilot.fire = true;
    }
    if (t > 3.4 && !T.st.done) S.detonate(g, T.st);
    if (T.st.done && !T.boom) {
      T.boom = true;
      S.note('boom');
      S.pilot.fire = false;
      S.pilot.aim = null;
      S.pilot.autoAim = true;
    }
  },
});

// --- Ben's chalk: "my squad" ----------------------------------------------------------------------

shot({
  name: 'chalk',
  level: 'city',
  seed: 1337,
  rng: 6,
  seconds: 8,
  camera: TOP(72),
  settings: { ...CITY },
  setup(S, T) {
    const g = S.game;
    S.calm();
    const d = g.world.map.ben.chalk.find((c) => c.kind === 'drawing');
    T.d = d;
    S.clear(d.x, d.y, 700);
    // Sam stops beside you, not behind you: both of you looking at it.
    S.ALLY.spotBack = 4;
    S.ALLY.spotSide = 64;
    S.place(g.player, d.x - 30, d.y + 330, -Math.PI / 2);
    S.place(g.ally, d.x + 40, d.y + 340, -Math.PI / 2);
    S.pilot.goal = { x: d.x - 34, y: d.y + 118 };
    S.pilot.speed = 0.45;
    S.pilot.aim = { x: d.x - 10, y: d.y - 10 };
    S.cam.zoom = (t) => 330 - S.ease(t / 8) * 80;
    S.cam.mode = 'track';
    S.cam.k = 1.2;
    S.cam.target = (t) => ({ x: d.x, y: d.y + 120 - S.ease(t / 8) * 60 });
    S.snapCamera(d.x, d.y + 120);
    S.tags.on = false;
  },
});

// --- Pier 9: the flare ----------------------------------------------------------------------------

shot({
  name: 'flare',
  level: 'docks',
  seed: 1337,
  rng: 2,
  seconds: 6,
  camera: ISO(40),
  settings: { ally: true, darkness: 0.78, ferryTime: 30 },
  setup(S, T) {
    const g = S.game;
    S.calm();
    const F = g.events.finale;
    T.F = F;
    S.clear(F.flare.x, F.flare.y, 1200);
    S.place(g.player, F.flare.x - 160, F.flare.y, 0);
    S.place(g.ally, F.flare.x - 220, F.flare.y + 30, 0);
    S.pilot.goal = { x: F.use.x, y: F.use.y };
    S.pilot.arrive = 8;
    S.pilot.speed = 0.8;
    S.cam.zoom = 380;
    S.cam.mode = 'track';
    S.cam.k = 2;
    S.cam.target = () => ({ x: F.flare.x - 120, y: F.flare.y - 40 });
    S.snapCamera(F.flare.x - 120, F.flare.y - 40);
  },
  tick(S, t, k, T) {
    if (T.F.state !== 'idle' && !T.fired) {
      T.fired = true;
      S.note('flare');
    }
  },
});

// --- Pier 9: the ferry comes in, and both of you get on ---------------------------------------

function ferryShot(name, warmFor, seconds, rng, cam) {
  shot({
    name,
    level: 'docks',
    seed: 1337,
    rng,
    seconds,
    camera: ISO(35),
    settings: { ally: true, darkness: 0.78, ferryTime: 30, godMode: true },
    setup(S, T) {
      const g = S.game;
      S.calm();
      const F = g.events.finale;
      T.F = F;
      S.clear(F.flare.x, F.flare.y, 1500);
      S.place(g.player, F.flare.x - 120, F.flare.y, 0);
      S.place(g.ally, F.flare.x - 180, F.flare.y + 30, 0);
      S.pilot.autoAim = true;
      S.pilot.autoRange = 520;
      S.pilot.arrive = 8;
      // Fire the flare, then hold the end of the pier.
      S.warm(warmFor, () => {
        g.ally.hp = Math.max(g.ally.hp, 60);
        if (g.ally.down) {
          g.ally.down = false;
          g.ally.hp = 60;
        }
        S.pilot.goal = F.state === 'idle' ? { x: F.use.x, y: F.use.y } : { x: F.flare.x - 60, y: F.flare.y };
      });
      const er = g.world.map.endRoom.interior;
      T.gang = { x: er.x + er.w / 2, y: er.y + er.h / 2 };
      cam(S, T, g);
      S.note(`state ${F.state} t ${F.t.toFixed(1)}`);
    },
    tick(S, t, k, T) {
      const g = S.game;
      g.ally.hp = Math.max(g.ally.hp, 50);
      const F = T.F;
      if (F.state === 'docked' && !T.docked) {
        T.docked = true;
        T.runAt = t + 0.5;
        S.note('docked');
      }
      if (T.docked && t > T.runAt) {
        S.pilot.autoAim = false;
        S.pilot.goal = T.gang;
        S.pilot.speed = 1;
      } else S.pilot.goal = { x: F.flare.x - 60, y: F.flare.y };
      if (g.won && !T.won) {
        T.won = true;
        S.note('won');
      }
    },
  });
}

// The ship sails in, searchlight on the pier, while the two of them hold it.
ferryShot('ferry_arrive', 8, 7, 12, (S, T, g) => {
  const F = T.F;
  S.cam.zoom = (t) => 640 - S.ease(t / 7) * 80;
  S.cam.mode = 'track';
  S.cam.k = 1.5;
  S.cam.target = () => ({ x: F.flare.x + 60, y: F.flare.y - 160 });
  S.snapCamera(F.flare.x + 60, F.flare.y - 160);
});

// Alongside: the gangway comes down, and both of them run for it.
ferryShot('ferry', 25, 9, 12, (S, T, g) => {
  S.cam.zoom = (t) => 470 - S.ease(t / 9) * 90;
  S.cam.mode = 'track';
  S.cam.k = 1.6;
  S.cam.target = () => mid(g.player, T.gang, 0.5);
  S.snapCamera(g.player.x - 60, g.player.y - 30);
});

// --- B-roll: the other places on the way -------------------------------------------------------

function walk(name, level, seed, from, to, opts = {}) {
  shot({
    name,
    level,
    seed,
    rng: opts.rng || 1,
    seconds: opts.seconds || 5,
    camera: opts.camera || ISO(40),
    settings: { ally: true, darkness: opts.darkness || 0.75 },
    setup(S, T) {
      const g = S.game;
      S.calm();
      S.clear(from.x, from.y, 500);
      const a = Math.atan2(to.y - from.y, to.x - from.x);
      S.place(g.player, from.x, from.y, a);
      S.place(g.ally, from.x - Math.cos(a) * 60 + Math.sin(a) * 40, from.y - Math.sin(a) * 60 - Math.cos(a) * 40, a);
      S.pilot.goal = to;
      S.pilot.speed = opts.speed || 0.55;
      S.pilot.autoAim = !!opts.fight;
      S.cam.zoom = opts.zoom || 380;
      S.cam.mode = 'track';
      S.cam.k = 2;
      S.cam.target = () => mid(g.player, g.ally);
      S.snapCamera(from.x, from.y);
      if (opts.crowd) for (const c of opts.crowd) S.crowd(c.x, c.y, c.n, c.r || 60, c.alert !== false);
    },
  });
}

walk('walk_graveyard', 'graveyard', 1337, { x: 2600, y: 1700 }, { x: 3000, y: 1500 }, { rng: 31, crowd: [{ x: 3150, y: 1450, n: 4, alert: false }] });
walk('walk_suburbia', 'suburbia', 1337, { x: 2200, y: 2100 }, { x: 2650, y: 2000 }, { rng: 32 });
walk('walk_junkyard', 'junkyard', 1337, { x: 2400, y: 1700 }, { x: 2850, y: 1600 }, { rng: 33 });
walk('walk_building', 'interior', 1337, { x: 1500, y: 1200 }, { x: 1900, y: 1200 }, { rng: 34, camera: { cameraAligned: false, cameraTilt: 55 } });

// --- The end: someone left a note -------------------------------------------------------------------

shot({
  name: 'come_too',
  level: 'city',
  seed: 1337,
  rng: 14,
  seconds: 9,
  camera: TOP(70),
  settings: { ...CITY, darkness: 0.85 },
  hud: { threats: false, objective: false, panels: false, marker: false, buttons: false, sticks: false, bars: false, pinned: false, messages: false, end: false },
  setup(S, T) {
    const g = S.game;
    S.calm();
    // The crossroads outside the first safe room, where they left him (his "here" is up there
    // under somebody's "BEN?"). The two of them walk north past it; their lights find it for a
    // moment, and they go on out of the picture.
    T.at = { x: 850, y: 2995 };
    S.clear(T.at.x, T.at.y, 1200);
    S.crayon(T.at.x, T.at.y, 'can i come too?', 22, -0.05);
    // A candle's worth of warm light on it, like the one by his bed.
    g.world.map.glows.push({ x: T.at.x + 10, y: T.at.y + 10, r: 170, k: 0.42, tint: 'rgba(0,0,0,0)', ben: true });
    S.place(g.player, 548, 3175, -Math.PI / 2);
    S.place(g.ally, 505, 3215, -Math.PI / 2);
    S.pilot.goal = { x: 575, y: 2600 };
    S.pilot.speed = 0.55;
    S.pilot.aim = { x: T.at.x, y: T.at.y };
    S.cam.zoom = 270;
    S.cam.mode = 'fixed';
    S.cam.x = 720;
    S.cam.y = 2978;
    S.snapCamera(720, 2978);
    S.tags.on = false;
  },
  tick(S, t, k, T) {
    const g = S.game;
    // Their lights leave the writing and go on up the street.
    if (t > 2.4) S.pilot.aim = { x: g.player.x + 30, y: g.player.y - 300 };
    // Somewhere out of sight, someone whistles a few notes (the game's own whistle for Ben).
    if (k === Math.round(4.2 * 30)) {
      g.audio.benWhistle(T.at.x + 200, T.at.y - 320);
      S.note('whistle');
    }
  },
});

// --- The 30-second spot (spot30 in edit.py) -------------------------------------------------------

// Endless infected: a horde pouring down the street at the two of them.
shot({
  name: 'horde_big',
  level: 'city',
  seed: 1337,
  rng: 41,
  seconds: 7,
  camera: ISO(32),
  settings: { ...CITY, godMode: true },
  setup(S, T) {
    const g = S.game;
    S.calm();
    S.clear(2500, 2250, 1500);
    S.place(g.player, 2330, 2232, 0);
    S.place(g.ally, 2290, 2282, 0);
    // From up the street and down the side street, all at once.
    for (let i = 0; i < 6; i++) S.crowd(2720 + i * 70, 2215 + (i % 2) * 60, 13, 70, true);
    S.crowd(2890, 1960, 18, 80, true);
    S.crowd(2890, 1780, 14, 80, true);
    S.pilot.autoAim = true;
    S.pilot.autoRange = 640;
    S.pilot.goal = { x: 2300, y: 2236 };
    S.pilot.speed = 0.35;
    S.cam.zoom = (t) => 430 - S.ease(t / 7) * 40;
    S.cam.mode = 'track';
    S.cam.k = 2;
    S.cam.target = () => ({ x: g.player.x + 170, y: g.player.y - 20 });
    S.snapCamera(2500, 2215);
  },
  tick(S, t, k, T) {
    const g = S.game;
    if (k === 6) {
      g.audio.horde(2900, 2200);
      g.announce('HERE THEY COME!', '#ff6b5a', 2.2);
    }
    if (g.ally.hp < 50) g.ally.hp = 50;
    if (g.ally.down) {
      g.ally.down = false;
      g.ally.hp = 50;
    }
  },
});

// The last scare: walking the rows in the dark, a heartbeat, you turn round, and it's right there.
shot({
  name: 'terror_scare',
  level: 'graveyard',
  seed: 1337,
  rng: 43,
  seconds: 5,
  camera: ISO(42),
  settings: { ally: true, darkness: 0.9, nightTerror: true },
  hud: { threats: false, objective: false, panels: false, marker: false, buttons: false, sticks: false, bars: false, pinned: false, messages: false, end: false },
  setup(S, T) {
    const g = S.game;
    S.calm();
    T.from = { x: 1960, y: 2385 };
    S.clear(T.from.x, T.from.y, 1400);
    // Side by side, lights forward.
    S.ALLY.spotBack = 6;
    S.ALLY.spotSide = 58;
    S.place(g.player, T.from.x, T.from.y, 0);
    S.place(g.ally, T.from.x - 10, T.from.y - 58, 0);
    S.pilot.goal = { x: T.from.x + 400, y: T.from.y };
    S.pilot.speed = 0.38;
    S.pilot.aim = { x: T.from.x + 700, y: T.from.y };
    T.z = S.spawnTerror(g, T.from.x - 150, T.from.y + 24);
    T.revealAt = 2.6;
    S.cam.zoom = 232;
    S.cam.mode = 'track';
    S.cam.k = 7;
    S.cam.target = () => ({ x: g.player.x - 66, y: g.player.y + 14 });
    S.snapCamera(T.from.x - 66, T.from.y + 14);
  },
  tick(S, t, k, T) {
    const g = S.game;
    const p = g.player;
    // You turn round.
    if (t >= T.revealAt) {
      S.pilot.goal = null;
      S.pilot.aim = { x: T.z.x, y: T.z.y };
      if (!T.noted) {
        T.noted = true;
        S.note('turn');
      }
    } else S.pilot.aim = { x: p.x + 700, y: p.y };
    if (!T.lit && T.z.lit > 0.4) {
      T.lit = true;
      // Where it is on screen (1920x1080 px), for the edit's punch-in.
      const v = g.view;
      S.note(`lit at ${Math.round(v.px(T.z.x, T.z.y) * 2)},${Math.round(v.py(T.z.x, T.z.y, 30) * 2)}`);
    }
  },
  post(S, t, k, T) {
    const g = S.game;
    const p = g.player;
    const z = T.z;
    // It keeps a step behind you in the dark until you turn.
    if (t < T.revealAt) {
      z.x = p.x - 150;
      z.y = p.y + 24;
      z.vx = p.vx;
      z.vy = p.vy;
      z.mode = 'stalk';
      z.attackCd = 5;
      z.face = Math.atan2(p.y - z.y, p.x - z.x);
    }
  },
});
