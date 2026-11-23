// The trailer's shot list: what happens, where the camera is, how fast time runs.
//
//   node tools/trailer/shots.mjs [--out DIR] [--preview] [shot names...]     (npm run trailer:shots)
//
// Each shot is filmed into DIR/<name>/00000.jpg... (1920x1080, 30 fps) with a contact sheet
// DIR/<name>.jpg and the shot's sound log DIR/<name>.json. --preview films every third frame.
//
// setup(g, T, V) and script(g, T, dt, st, V) run inside the game page (see rig.mjs): st is game
// seconds since setup, V the shot's vars. speed(t) is game seconds per film second at film time t.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Rig, fnSource } from './rig.mjs';

const BASE = {
  ally: true,
  allyWeapon: 'shotgun',
  allyAccuracy: 0.85,
  godMode: true,
  specials: false,
  nightTerror: false,
  witch: true,
  night: true,
  darkness: 0.55,
  los: false,
  threatIndicators: false,
  laser: true,
  screenShake: 1.2,
  hordeSize: 1,
  wanderers: 1.5,
  landmarks: true,
  holdout: false,
  routes: false,
  lore: true,
  ben: true,
  ferryTime: 30,
  playtestPrompt: false,
};

// Slow motion: hold `a` until t0, ease to `b` by t1.
const ramp = (a, b, t0, t1) => (t) => (t <= t0 ? a : t >= t1 ? b : a + (b - a) * (0.5 - 0.5 * Math.cos(((t - t0) / (t1 - t0)) * Math.PI)));

export const SHOTS = [
  // --- Act 1: the city that stopped sleeping ------------------------------------------------
  {
    name: 'establish_city',
    level: 'city',
    settings: { wanderers: 4 },
    seconds: 6,
    setup(g, T) {
      T.place(368, 3194, 0);
      T.cam = { mode: 'fixed', tx: 2350, ty: 2050, yaw: 0.785, pitch: 0.62, viewSize: 1350, stiff: 50 };
    },
    script(g, T, dt) {
      T.cam.tx += 70 * dt;
      T.cam.ty -= 25 * dt;
      T.cam.viewSize = Math.max(1150, T.cam.viewSize - 30 * dt);
    },
  },
  {
    name: 'saferoom',
    level: 'city',
    seconds: 7,
    setup(g, T, V) {
      const I = g.world.map.startRoom.interior;
      const d = g.world.map.decor.find((o) => o.type === 'bentext' && /day 3/.test(o.text)) || { x: I.x + I.w / 2, y: I.y + I.h / 2 };
      V.dx = d.x;
      V.dy = d.y;
      T.place(I.x + I.w - 36, I.y + I.h * 0.62, 0, 46, 34);
      T.cam = { mode: 'fixed', tx: d.x, ty: d.y, yaw: 0.785, pitch: 1.1, viewSize: 150, stiff: 50 };
    },
    script(g, T, dt, st, V) {
      const k = Math.min(1, Math.max(0, (st - 1.2) / 4.8));
      const e = k * k * (3 - 2 * k);
      const I = g.world.map.startRoom.interior;
      T.cam.viewSize = 150 + (330 - 150) * e;
      T.cam.pitch = 1.1 + (0.62 - 1.1) * e;
      T.cam.tx = V.dx + (I.x + I.w * 0.62 - V.dx) * e;
      T.cam.ty = V.dy + (I.y + I.h * 0.5 - V.dy) * e;
    },
  },
  {
    name: 'ben_drawing',
    level: 'city',
    seconds: 6,
    setup(g, T) {
      T.place(2190, 500, Math.atan2(373 - 500, 2114 - 2190), 20, 70);
      T.auto = { fire: false, aimHeading: Math.atan2(373 - 500, 2114 - 2190) };
      T.clear(2114, 400, 500);
      T.cam = { mode: 'fixed', tx: 2120, ty: 400, yaw: 0.2, pitch: 1.0, viewSize: 330, stiff: 50 };
    },
    script(g, T, dt, st) {
      T.cam.yaw += 0.035 * dt;
      T.cam.viewSize = Math.max(280, T.cam.viewSize - 9 * dt);
      T.auto.aimHeading = Math.atan2(373 - 500, 2114 - 2190) + 0.18 * Math.sin(st * 0.8);
    },
  },
  {
    name: 'step_out',
    level: 'city',
    seconds: 6,
    speed: () => 0.55,
    setup(g, T) {
      const I = g.world.map.startRoom.interior;
      T.place(I.x + I.w - 50, I.y + I.h / 2, 0, 50, 30);
      T.auto = { move: 'goal', speed: 0.6, fire: false, shove: false };
      T.cam = { mode: 'pair', yaw: 0.785, pitch: 0.62, viewSize: 340, lead: 40, stiff: 3 };
    },
  },

  // --- Act 2: here they come -------------------------------------------------------------------
  {
    name: 'horde_reveal',
    level: 'city',
    settings: { hordeSize: 6 },
    seconds: 7,
    preroll: 0.4,
    setup(g, T) {
      T.place(2109, 1448, Math.PI, 70, 50);
      T.messages = 'big';
      T.vignette = 0.25;
      T.auto = { range: 560, shoveAt: 2 };
      T.cam = { mode: 'pair', yaw: 0.785, pitch: 0.6, viewSize: 950, stiff: 3 };
    },
    script(g, T, dt, st, V) {
      if (!V.go && st > 0.6) {
        V.go = 1;
        g.director.forceMob();
        T.crowd(1600, 1448, 140, 160);
        T.crowd(2109, 980, 90, 140);
        T.crowd(2550, 1448, 60, 120);
      }
      T.cam.viewSize = Math.max(720, T.cam.viewSize - 40 * dt);
    },
  },
  {
    name: 'run_streets',
    level: 'city',
    settings: { hordeSize: 4 },
    seconds: 9,
    preroll: 1.5,
    setup(g, T) {
      T.place(1290, 2700, -Math.PI / 2, 60, 30);
      T.auto = { move: 'to', x: 1290, y: 300, range: 500, shoveAt: 2 };
      T.crowd(1290, 3020, 160, 170);
      T.crowd(1100, 2880, 60, 90);
      T.cam = { mode: 'pair', yaw: 0.2, pitch: 0.55, viewSize: 540, lead: -80, stiff: 4 };
    },
  },
  {
    name: 'run_junkyard',
    level: 'junkyard',
    settings: { hordeSize: 4 },
    seconds: 9,
    preroll: 9,
    setup(g, T) {
      T.messages = 'big';
      T.auto = { move: 'goal', range: 480, shoveAt: 2 };
      T.cam = { mode: 'pair', yaw: 1.05, pitch: 0.52, viewSize: 560, lead: -60, stiff: 4 };
    },
    script(g, T, dt, st, V) {
      if (!V.go && st > 6) {
        V.go = 1;
        g.director.forceMob();
        const p = g.player;
        T.crowd(p.x - 380, p.y + 300, 120, 180);
      }
    },
  },
  {
    name: 'run_graveyard',
    level: 'graveyard',
    settings: { hordeSize: 4 },
    seconds: 9,
    preroll: 9,
    setup(g, T) {
      T.auto = { move: 'goal', range: 520, shoveAt: 2 };
      T.cam = { mode: 'pair', yaw: 0.5, pitch: 0.48, viewSize: 600, lead: -80, stiff: 4 };
    },
    script(g, T, dt, st, V) {
      if (!V.go && st > 6) {
        V.go = 1;
        g.director.forceMob();
        const p = g.player;
        T.crowd(p.x - 350, p.y + 250, 120, 200);
      }
    },
  },
  {
    name: 'run_suburbia',
    level: 'suburbia',
    settings: { hordeSize: 4, witch: false },
    seconds: 9,
    preroll: 9,
    setup(g, T) {
      T.auto = { move: 'goal', range: 520, shoveAt: 2 };
      T.cam = { mode: 'pair', yaw: 0.785, pitch: 0.45, viewSize: 560, lead: -80, stiff: 4 };
    },
    script(g, T, dt, st, V) {
      if (!V.go && st > 6) {
        V.go = 1;
        g.director.forceMob();
        const p = g.player;
        T.crowd(p.x - 350, p.y + 250, 120, 200);
      }
    },
  },
  {
    name: 'building_horde',
    level: 'interior',
    settings: { hordeSize: 8, witch: false },
    seconds: 9,
    preroll: 8,
    setup(g, T) {
      T.auto = { move: 'goal', range: 480, shoveAt: 2 };
      T.cam = { mode: 'pair', yaw: 0.785, pitch: 0.8, viewSize: 540, stiff: 4 };
    },
    script(g, T, dt, st, V) {
      if (!V.go && st > 5) {
        V.go = 1;
        g.director.forceMob();
        g.director.forceMob();
      }
    },
  },

  // --- Set pieces -----------------------------------------------------------------------------
  {
    name: 'alarm_car',
    level: 'city',
    settings: { hordeSize: 5 },
    seconds: 9,
    preroll: 0.2,
    setup(g, T) {
      T.place(1240, 2243, 0, 60, -40);
      T.messages = 'big';
      T.auto = { aimAt: { x: 1545, y: 2305 }, fireAt: false };
      T.cam = { mode: 'pair', yaw: 0.6, pitch: 0.5, viewSize: 560, stiff: 4, offX: 120 };
    },
    script(g, T, dt, st, V) {
      if (st > 0.9 && st < 1.5) T.auto.fireAt = true;
      if (st >= 1.5 && !V.free) {
        V.free = 1;
        T.auto = { range: 560, shoveAt: 2 };
      }
      if (!V.go && st > 2.2) {
        V.go = 1;
        T.crowd(1545, 1900, 90, 160);
        T.crowd(1900, 2243, 90, 160);
      }
      T.cam.viewSize = Math.min(700, T.cam.viewSize + 18 * dt);
    },
  },
  {
    name: 'gas_station',
    level: 'city',
    settings: { hordeSize: 2 },
    seconds: 8,
    speed: ramp(1, 0.28, 1.9, 2.4),
    setup(g, T, V) {
      T.place(3650, 2690, Math.PI, 60, -60);
      T.auto = { range: 300, shoveAt: 2 };
      T.crowd(3190, 2640, 150, 180);
      T.crowd(2950, 2640, 80, 150);
      T.cam = { mode: 'fixed', tx: 3390, ty: 2655, yaw: 0.785, pitch: 0.58, viewSize: 720, stiff: 50 };
      const part = g.events.explosives[0].parts[0];
      V.px = part.x + part.w / 2;
      V.py = part.y + part.h / 2;
    },
    script(g, T, dt, st, V) {
      const e = g.events.explosives[0];
      if (st > 1.2 && !V.aim) {
        V.aim = 1;
        T.auto = { aimAt: { x: V.px, y: V.py }, fireAt: true, shove: false };
      }
      if (st > 2.1 && !e.done && !V.boom) {
        V.boom = 1;
        T.mods.events.detonate(g, e);
      }
      if (st > 2.5 && !V.free) {
        V.free = 1;
        T.auto = { range: 520, shoveAt: 2 };
      }
    },
  },
  {
    name: 'tank_reveal',
    level: 'graveyard',
    settings: { tankHealth: 3, hordeSize: 1 },
    seconds: 6,
    speed: ramp(0.35, 1, 2.2, 3.4),
    setup(g, T, V) {
      const s = T.routePoint(0.33);
      const a = T.routePoint(0.4);
      T.place(s.x, s.y, s.dir, 60, 50);
      T.clear(a.x, a.y, 350);
      T.auto = { range: 480, shove: false };
      const t = T.mods.specials.spawnTank(g, a.x, a.y);
      V.ok = !!t;
      T.cam = { mode: 'thing', thing: t || g.player, yaw: T.yawFrom(s.x, s.y, a.x, a.y), pitch: 0.42, viewSize: 280, stiff: 3, lift: 40 };
    },
    script(g, T, dt) {
      T.cam.viewSize = Math.min(440, T.cam.viewSize + 24 * dt);
    },
  },
  {
    name: 'tank_fight',
    level: 'graveyard',
    settings: { tankHealth: 3, hordeSize: 2 },
    seconds: 10,
    preroll: 0.5,
    setup(g, T) {
      const s = T.routePoint(0.33);
      const a = T.routePoint(0.37);
      T.place(s.x, s.y, s.dir, 60, 50);
      T.auto = { range: 520, shoveAt: 3 };
      T.mods.specials.spawnTank(g, a.x, a.y);
      T.cam = { mode: 'pair', yaw: T.yawFrom(s.x, s.y, a.x, a.y) + 0.5, pitch: 0.5, viewSize: 470, stiff: 3 };
    },
  },
  {
    name: 'witch',
    level: 'city',
    settings: { allyWeapon: 'rifle' },
    seconds: 8,
    speed: (t) => (t < 2.0 ? 1 : t < 3.4 ? 0.35 : 1),
    setup(g, T, V) {
      const w = g.witches[0];
      V.wx = w.x;
      V.wy = w.y;
      T.clear(w.x, w.y, 700);
      T.place(w.x + 360, w.y - 40, Math.PI, 60, 50);
      g.player.wi = 2;
      T.auto = { move: 'to', x: w.x + 170, y: w.y - 20, speed: 0.45, fire: false, shove: false, aimHeading: Math.PI };
      T.cam = { mode: 'fixed', tx: w.x + 70, ty: w.y, yaw: 0.785, pitch: 0.45, viewSize: 280, stiff: 2 };
    },
    script(g, T, dt, st, V) {
      const w = g.witches[0];
      if (st > 2.0 && !V.go) {
        V.go = 1;
        T.mods.witch.startle(g, w, 'player');
      }
      if (st > 2.2 && !V.run) {
        V.run = 1;
        T.auto = { move: 'heading', heading: 0, speed: 1, shootWitch: true, range: 600, shove: true };
      }
      if (V.run) {
        T.cam.tx += (g.player.x - 60 - T.cam.tx) * Math.min(1, dt * 2);
        T.cam.ty += (g.player.y - T.cam.ty) * Math.min(1, dt * 2);
        T.cam.viewSize = Math.min(520, T.cam.viewSize + 90 * dt);
      }
    },
  },
  {
    name: 'ally_down',
    level: 'city',
    settings: { hordeSize: 2 },
    seconds: 9,
    speed: () => 0.6,
    setup(g, T) {
      T.place(3635, 2243, Math.PI, 150, 0);
      T.clear(3635, 2243, 600);
      T.allyGod = false;
      T.messages = true;
      T.msgScale = 2.4;
      g.ally.medkits = 0;
      T.auto = { range: 360, shoveAt: 1 };
      T.crowd(g.ally.x - 110, g.ally.y, 12, 50);
      T.cam = { mode: 'thing', thing: g.ally, yaw: 0.6, pitch: 0.5, viewSize: 380, stiff: 3 };
    },
    script(g, T, dt, st, V) {
      const a = g.ally;
      if (!V.hit && st > 0.9 && !a.down) {
        V.hit = 1;
        g.hurtAlly(a.hp + 5, { x: a.x - 30, y: a.y }, { knock: 90 });
      }
      if (a.down) a.downHp = Math.max(a.downHp, 70);
      if (a.down && !V.rev) {
        V.rev = 1;
        T.auto = { move: 'to', x: a.x + 26, y: a.y, arrive: 18, fire: false, shoveAt: 1 };
      }
      if (V.rev && !a.down && !V.up) {
        V.up = 1;
        T.allyGod = true;
        T.auto = { range: 480, shoveAt: 2 };
      }
      if (!V.more && st > 1.2) {
        V.more = 1;
        T.crowd(a.x - 520, a.y, 40, 120);
        T.crowd(a.x, a.y - 480, 30, 110);
      }
    },
  },
  {
    name: 'orbit',
    level: 'graveyard',
    settings: { hordeSize: 2 },
    seconds: 10,
    preroll: 1.0,
    setup(g, T, V) {
      const s = T.routePoint(0.55);
      V.x = s.x;
      V.y = s.y;
      T.place(s.x, s.y, s.dir, 70, 40);
      T.vignette = 0.1;
      g.player.hot = 9999;
      T.auto = { range: 560, shoveAt: 2 };
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.3;
        T.crowd(s.x + Math.cos(a) * 520, s.y + Math.sin(a) * 520, 28, 120);
      }
      T.cam = { mode: 'pair', yaw: 0.2, pitch: 0.5, viewSize: 480, stiff: 4 };
    },
    script(g, T, dt, st, V) {
      T.cam.yaw += 0.42 * dt;
      if (!V.more && st > 4) {
        V.more = 1;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + 0.9;
          T.crowd(V.x + Math.cos(a) * 560, V.y + Math.sin(a) * 560, 24, 120);
        }
      }
    },
  },
  {
    name: 'overhead',
    level: 'city',
    settings: { hordeSize: 3, wanderers: 4 },
    seconds: 7,
    preroll: 2.5,
    setup(g, T) {
      T.place(2109, 2243, 0, 60, 40);
      T.vignette = 0;
      T.auto = { range: 520, shoveAt: 2 };
      for (const [dx, dy] of [[-700, 0], [700, 0], [0, -600], [0, 650], [-600, -500], [600, 500], [600, -500], [-600, 500]]) T.crowd(2109 + dx, 2243 + dy, 90, 200);
      T.cam = { mode: 'pair', yaw: 0, pitch: 1.35, viewSize: 1500, stiff: 3 };
    },
    script(g, T, dt) {
      T.cam.viewSize = Math.max(1050, T.cam.viewSize - 70 * dt);
    },
  },

  // --- Act 3: Pier 9 --------------------------------------------------------------------------
  {
    name: 'pier_flare',
    level: 'docks',
    seconds: 7,
    preroll: 0.2,
    setup(g, T) {
      T.place(4580, 545, 0, 60, 40);
      T.messages = true;
      T.msgScale = 1.7;
      T.auto = { move: 'to', x: 4714, y: 540, arrive: 8, fire: false, shove: false };
      T.cam = { mode: 'fixed', tx: 4650, ty: 545, yaw: 0.785, pitch: 0.55, viewSize: 420, stiff: 50 };
    },
    script(g, T, dt, st, V) {
      // Once the flare is up, the objective lines step aside for FLARE UP!
      const F = g.events.finale;
      if (F && F.state !== 'idle' && !V.clean) {
        V.clean = 1;
        for (const m of g.messages) if (/LAST FERRY|FIRE THE FLARE/.test(m.text)) m.t = Math.max(m.t, m.dur - 0.12);
      }
      if (st > 2.2) {
        T.cam.viewSize = Math.min(980, T.cam.viewSize + 160 * dt);
        T.cam.tx = Math.max(4420, T.cam.tx - 45 * dt);
      }
    },
  },
  {
    name: 'pier_hold',
    level: 'docks',
    settings: { hordeSize: 3 },
    seconds: 16,
    preroll: 4,
    setup(g, T) {
      T.place(4640, 540, Math.PI, 50, 60);
      T.messages = true;
      T.msgScale = 1.7;
      T.vignette = 0.2;
      T.auto = { move: 'to', x: 4714, y: 540, arrive: 8, fire: false, shove: false };
      T.cam = { mode: 'pair', yaw: 0.45, pitch: 0.5, viewSize: 600, stiff: 3 };
    },
    script(g, T, dt, st, V) {
      if (st > 1.6 && !V.hold) {
        V.hold = 1;
        T.auto = { move: 'to', x: 4560, y: 540, arrive: 30, range: 620, shoveAt: 2 };
        T.crowd(3600, 540, 160, 150);
        T.crowd(3300, 540, 120, 150);
      }
      if (!V.more && st > 9) {
        V.more = 1;
        T.crowd(3550, 540, 150, 150);
      }
    },
  },
  {
    name: 'pier_ferry_wide',
    level: 'docks',
    settings: { hordeSize: 3 },
    seconds: 10,
    preroll: 14,
    setup(g, T) {
      T.place(4640, 540, Math.PI, 50, 60);
      T.vignette = 0.15;
      T.auto = { move: 'to', x: 4714, y: 540, arrive: 8, fire: false, shove: false };
      T.cam = { mode: 'fixed', tx: 4250, ty: 470, yaw: 0.785, pitch: 0.42, viewSize: 1100, stiff: 50 };
    },
    script(g, T, dt, st, V) {
      if (st > 1.6 && !V.hold) {
        V.hold = 1;
        T.auto = { move: 'to', x: 4560, y: 540, arrive: 30, range: 620, shoveAt: 2 };
        T.crowd(3600, 540, 160, 150);
        T.crowd(3300, 540, 120, 150);
      }
      if (!V.more && st > 9) {
        V.more = 1;
        T.crowd(3550, 540, 150, 150);
      }
      if (st > 14) {
        T.cam.tx -= 25 * dt;
        T.cam.viewSize = Math.max(900, T.cam.viewSize - 20 * dt);
      }
    },
  },
  {
    name: 'pier_aboard',
    level: 'docks',
    settings: { hordeSize: 2, ferryTime: 10 },
    seconds: 7,
    preroll: 9,
    setup(g, T) {
      T.place(4640, 540, Math.PI, 50, 60);
      T.messages = 'big';
      T.vignette = 0.2;
      T.auto = { move: 'to', x: 4714, y: 540, arrive: 8, fire: false, shove: false };
      T.cam = { mode: 'fixed', tx: 4480, ty: 470, yaw: 0.785, pitch: 0.5, viewSize: 600, stiff: 50 };
    },
    script(g, T, dt, st, V) {
      if (st > 1.6 && !V.hold) {
        V.hold = 1;
        T.auto = { move: 'to', x: 4600, y: 560, arrive: 30, range: 620, shoveAt: 2 };
        T.crowd(3700, 540, 70, 150);
      }
      const F = g.events.finale;
      if (F && F.state === 'docked' && F.gang > 0.6 && !V.go) {
        V.go = 1;
        T.auto = { move: 'goal', range: 500, shoveAt: 2 };
      }
    },
  },
];

async function contactSheet(dir, out) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  if (!files.length) return;
  const n = Math.min(12, files.length);
  const pick = Array.from({ length: n }, (_, i) => files[Math.round((i * (files.length - 1)) / Math.max(1, n - 1))]);
  const list = path.join(dir, '..', `${path.basename(dir)}.list`);
  fs.writeFileSync(list, pick.map((f) => `file '${path.join(dir, f)}'`).join('\n'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=480:270,tile=4x3:padding=4', '-frames:v', '1', out]);
  fs.unlinkSync(list);
}

export async function filmShot(rig, shot, outDir, { preview = false, fps = 30 } = {}) {
  const t0 = Date.now();
  await rig.newRun({ settings: { ...BASE, level: shot.level, ...(shot.settings || {}) }, seed: shot.seed ?? 1337, rseed: shot.rseed ?? 7 });
  await rig.run(
    (g, T, a) => {
      // eslint-disable-next-line no-new-func
      const setup = new Function(`return (${a.setup})`)();
      setup(g, T, T.vars);
    },
    { setup: fnSource(shot.setup) },
  );
  await rig.script(shot.script || null);
  if (shot.preroll) await rig.preroll(shot.preroll, { dt: 1 / 30 });
  const dir = path.join(outDir, shot.name);
  fs.rmSync(dir, { recursive: true, force: true });
  const frames = Math.round(shot.seconds * fps);
  const speed = shot.speed || (() => 1);
  let log;
  if (preview) {
    // Every third frame: the same game time, a third of the captures.
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < frames; i += 3) {
      await rig.preroll((speed(i / fps) * 2) / fps, { dt: speed(i / fps) / fps });
      log = await rig.film(dir, 1, { fps, speed: speed(i / fps), from: i });
    }
  } else {
    log = await rig.film(dir, frames, { fps, speed: (i) => speed(i / fps) });
  }
  fs.writeFileSync(path.join(outDir, `${shot.name}.json`), JSON.stringify(log));
  await contactSheet(dir, path.join(outDir, `${shot.name}.jpg`));
  const info = await rig.run((g) => ({ t: +g.time.toFixed(1), z: g.zombies.length, kills: g.stats.kills, won: g.won, allyDown: g.ally && g.ally.down, revives: g.stats.revives }));
  console.log(`${shot.name}: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(info));
}

async function main() {
  const args = process.argv.slice(2);
  let out = path.resolve('trailer-shots');
  const names = [];
  let preview = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') out = path.resolve(args[++i]);
    else if (args[i] === '--preview') preview = true;
    else names.push(args[i]);
  }
  fs.mkdirSync(out, { recursive: true });
  const list = names.length ? names.map((n) => SHOTS.find((s) => s.name === n)).filter(Boolean) : SHOTS;
  const rig = new Rig();
  await rig.open(BASE, 7);
  try {
    for (const shot of list) await filmShot(rig, shot, out, { preview });
  } finally {
    await rig.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
