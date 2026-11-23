// Shot list for the co-op trailer. The second survivor is the game's AI teammate; where a shot
// needs it to look somewhere on cue, its light (facing) is steered through window.__allyFace.
const base = require('./shots.js');

function helpers() {
  const H = eval('(' + BASE_HELPERS + ')')();
  H.wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  H.mixAng = (a, b, k) => a + H.wrap(b - a) * k;
  // Steer the teammate's light: reads of ally.facing return window.__allyFace when it is set.
  H.puppetAlly = (g) => {
    const a = g.ally;
    if (!a || a.__puppet) return;
    let f = a.facing;
    Object.defineProperty(a, 'facing', {
      configurable: true,
      get() { return window.__allyFace === undefined || window.__allyFace === null ? f : window.__allyFace; },
      set(v) { f = v; },
    });
    a.__puppet = true;
  };
  // An open spot on the map: lit (under a lamp), dark (no lamp near), with clear lanes if asked.
  H.findSpot = async (g, o = {}) => {
    const W = g.world, map = W.map;
    const { lightAt } = await import('/src/game/terror.js');
    const sr = map.startRoom.interior, er = map.endRoom.interior;
    const out = [];
    for (let gy = 0.1; gy <= 0.9; gy += 0.025) {
      for (let gx = 0.06; gx <= 0.94; gx += 0.02) {
        const x = map.w * gx, y = map.h * gy;
        if (!W.isFree(x, y, o.r || 60) || W.sealedAt(x, y) || !Number.isFinite(W.flow.pathDist(x, y))) continue;
        if (Math.hypot(x - sr.x - sr.w / 2, y - sr.y - sr.h / 2) < (o.fromStart || 700)) continue;
        if (Math.hypot(x - er.x - er.w / 2, y - er.y - er.h / 2) < 500) continue;
        if ((o.avoid || []).some(([ax, ay, ar]) => Math.hypot(x - ax, y - ay) < ar)) continue;
        if (o.laneX && !W.segmentClear(x - o.laneX, y, x + o.laneX, y, W.moveBlockers)) continue;
        if (o.laneY && !W.segmentClear(x, y - o.laneY, x, y + o.laneY, W.moveBlockers)) continue;
        const L = lightAt(g, x, y);
        if (o.lit === true && L < 0.14) continue;
        if (o.lit === false && (L > 0.05 || lightAt(g, x, y - 260) > 0.05 || lightAt(g, x - 260, y) > 0.05 || lightAt(g, x + 260, y) > 0.05)) continue;
        out.push({ x, y });
      }
    }
    return out.length ? out[Math.min(o.pick || 0, out.length - 1)] : null;
  };
  H.witchAvoid = (g) => {
    const w = g.zombies.find((z) => z.type === 'witch');
    return w ? [[w.x, w.y, 1150]] : [];
  };
  return H;
}

module.exports = {
  helpers: helpers.toString().replace('BASE_HELPERS', () => JSON.stringify(base.helpers.toString())),

  // Two of them in the first safe room, then out of the door together.
  duo_open: {
    settings: { level: 'city', ally: true, allyWeapon: 'smg' },
    frames: 135,
    setup: (g) => {
      const r = g.world.map.startRoom.interior;
      const p = g.player;
      g.ally.x = p.x + 44; g.ally.y = p.y + 22;
      window.__S = { r };
      return { p: [Math.round(p.x), Math.round(p.y)], ally: [Math.round(g.ally.x), Math.round(g.ally.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, r = S.r;
      const k = H.ease(i / 134);
      window.__cam = { x: r.x + r.w / 2 + 60 * H.ease((i - 45) / 90), y: r.y + 62 + 46 * k, zoom: 235 + 205 * k, still: true };
      if (i < 38) { H.stick(pad, 'move', null, 0); H.stick(pad, 'aim', -Math.PI / 2 - 0.25 + 0.5 * (i / 38), 0.38); return; }
      H.stick(pad, 'aim', null, 0);
      H.stick(pad, 'move', H.downhill(g, p.x, p.y, 48), 0.62);
    },
  },

  // Two lights in the cemetery rows: each covers a side.
  duo_lights: {
    settings: { level: 'graveyard', ally: true, godMode: true },
    frames: 150,
    setup: async (g) => {
      const H = window.__h;
      const s = await H.findSpot(g, { lit: false, avoid: H.witchAvoid(g), laneY: 300 });
      if (!s) return { err: 'no dark spot' };
      H.teleport(g, s.x, s.y, -Math.PI / 2);
      g.ally.x = s.x + 56; g.ally.y = s.y + 24;
      H.clearAround(g, s.x, s.y, 950);
      H.puppetAlly(g);
      const { Zombie } = await import('/src/game/zombies.js');
      let n = 0;
      for (let k = 0; k < 60 && n < 12; k++) {
        const left = k % 2 === 0;
        const t = (Math.floor(k / 2) % 10) / 9;
        const a = left ? -Math.PI * (0.58 + 0.34 * t) : -Math.PI * (0.42 - 0.34 * t);
        const d = 300 + ((k * 67) % 200);
        const x = s.x + Math.cos(a) * d, y = s.y - 60 + Math.sin(a) * d;
        if (!g.world.isFree(x, y, 12)) continue;
        const z = new Zombie(x, y, false);
        z.wanderStop = true; z.wanderT = 7;
        g.zombies.push(z); n++;
      }
      window.__S = { s };
      return { spot: [Math.round(s.x), Math.round(s.y)], drowsers: n };
    },
    direct: (i, g, pad) => {
      const H = window.__h, p = g.player;
      g.ally.cooldown = 1;
      H.stick(pad, 'move', -Math.PI / 2, i < 12 ? 0 : 0.4);
      H.stick(pad, 'aim', -Math.PI * (0.8 + 0.08 * Math.sin(i / 22)), 0.4);
      window.__allyFace = -Math.PI * (0.2 - 0.08 * Math.sin(i / 22 + 1.2));
      window.__cam = { x: p.x + 24, y: p.y - 70, zoom: 400, still: true };
    },
  },

  // Something behind you in the dark; your partner's light finds it.
  duo_terror: {
    settings: { level: 'graveyard', ally: true, nightTerror: true, godMode: true },
    frames: 165,
    setup: async (g) => {
      const H = window.__h;
      const s = await H.findSpot(g, { lit: false, avoid: H.witchAvoid(g), pick: 40 });
      if (!s) return { err: 'no dark spot' };
      H.teleport(g, s.x, s.y, -Math.PI / 2);
      g.ally.x = s.x - 72; g.ally.y = s.y + 6;
      H.clearAround(g, s.x, s.y, 1000);
      H.puppetAlly(g);
      const { spawnTerror } = await import('/src/game/terror.js');
      window.__S = { s, spawnTerror, z: null, whip: 0, face: -Math.PI / 2 - 0.45 };
      return { spot: [Math.round(s.x), Math.round(s.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, a = g.ally;
      if (i === 2) S.z = S.spawnTerror(g, p.x + 200, p.y + 340);
      g.ally.cooldown = 1;
      H.stick(pad, 'move', null, 0);
      const z = S.z;
      const d = z ? Math.hypot(z.x - p.x, z.y - p.y) : 1e9;
      if (z && z.alive && !S.whip && i > 20 && (z.mode === 'windup' || d < 195 || i > 70) && i > 36) S.whip = i;
      if (z && z.alive && S.whip) S.face = H.mixAng(S.face, Math.atan2(z.y - a.y, z.x - a.x), i - S.whip < 6 ? 0.45 : 0.6);
      window.__allyFace = S.face;
      if (z && z.alive && S.whip && i - S.whip > 22) H.stick(pad, 'aim', H.angTo(p, z.x, z.y), 0.4);
      else H.stick(pad, 'aim', -Math.PI / 2 + 0.12 * Math.sin(i / 28), 0.4);
      window.__cam = { x: p.x * 0.5 + a.x * 0.5 + 50, y: p.y + 125, zoom: 360, still: true };
      if (i % 10 === 0 && z) return { mode: z.mode, lit: +(z.lit || 0).toFixed(2), d: Math.round(d), whip: S.whip, alive: z.alive };
    },
  },

  // A Hunter pins you; your partner knocks it off.
  duo_hunter: {
    settings: { level: 'city', ally: true, allyWeapon: 'smg', godMode: true },
    frames: 210,
    setup: async (g) => {
      const H = window.__h;
      const s = await H.findSpot(g, { lit: true, laneX: 260, pick: 3 });
      if (!s) return { err: 'no lit spot' };
      H.teleport(g, s.x, s.y, 0);
      g.ally.x = s.x - 130; g.ally.y = s.y + 30;
      H.clearAround(g, s.x, s.y, 1000);
      const { spawnHunter } = await import('/src/game/specials.js');
      window.__S = { s, spawnHunter, h: null, pinned: 0, saved: 0 };
      return { spot: [Math.round(s.x), Math.round(s.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, a = g.ally;
      if (i === 2) {
        const W = g.world;
        for (const [dx, dy] of [[260, -120], [-260, -120], [260, 120], [0, -280], [0, 280]]) {
          if (W.isFree(p.x + dx, p.y + dy, 20) && W.segmentClear(p.x, p.y, p.x + dx, p.y + dy)) { S.h = S.spawnHunter(g, p.x + dx, p.y + dy); break; }
        }
        if (S.h) S.h.hp = 1e9;
      }
      const h = S.h;
      if (h && !S.pinned && p.pinnedBy === h) S.pinned = i;
      if (h && S.pinned && !S.saved && p.pinnedBy !== h) { S.saved = i; h.hp = 45; }
      if (!S.pinned || i - S.pinned < 20) { a.cooldown = 1; a.shoveCd = 1; }
      H.stick(pad, 'move', null, 0);
      if (h && h.alive) H.stick(pad, 'aim', H.angTo(p, h.x, h.y), S.saved && i - S.saved > 6 ? 1 : 0.4);
      else H.stick(pad, 'aim', 0, 0.4);
      const hx = h && h.alive ? h.x : p.x, hy = h && h.alive ? h.y : p.y;
      window.__cam = { x: p.x * 0.6 + hx * 0.2 + a.x * 0.2, y: p.y * 0.6 + hy * 0.2 + a.y * 0.2, zoom: 380, still: true };
      if (i % 10 === 0 && h) return { mode: h.mode, pinned: S.pinned, saved: S.saved, alive: h.alive };
    },
  },

  // Your partner goes down; pick them up before the horde gets there.
  duo_revive: {
    settings: { level: 'city', ally: true, godMode: true },
    frames: 165,
    setup: async (g) => {
      const H = window.__h;
      const s = await H.findSpot(g, { lit: true, laneX: 760, pick: 9 });
      if (!s) return { err: 'no lit lane' };
      g.ally.x = s.x; g.ally.y = s.y;
      H.teleport(g, s.x - 38, s.y + 16, 0);
      H.clearAround(g, s.x, s.y, 1200);
      const { hurtAlly } = await import('/src/game/ally.js');
      const { Zombie } = await import('/src/game/zombies.js');
      const W = g.world;
      const dir = W.segmentClear(s.x, s.y, s.x + 760, s.y, W.moveBlockers) ? 0 : Math.PI;
      window.__S = { s, hurtAlly, Zombie, dir, up: 0 };
      return { spot: [Math.round(s.x), Math.round(s.y)], dir };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, a = g.ally;
      if (i === 3) S.hurtAlly(g, 999);
      if (i === 10) {
        for (let k = 0; k < 24; k++) {
          const d = 640 + (k % 6) * 34 + Math.floor(k / 6) * 26;
          const off = ((k * 37) % 9 - 4) * 16;
          const x = S.s.x + Math.cos(S.dir) * d - Math.sin(S.dir) * off, y = S.s.y + Math.sin(S.dir) * d + Math.cos(S.dir) * off;
          if (g.world.isFree(x, y, 11)) g.zombies.push(new S.Zombie(x, y, true));
        }
      }
      if (!S.up && a.alive && !a.down && i > 10) S.up = i;
      H.stick(pad, 'move', null, 0);
      const { z, d } = H.nearest(g, p.x, p.y);
      if (!S.up) H.stick(pad, 'aim', S.dir, 0.4);
      else if (z) H.stick(pad, 'aim', H.angTo(p, z.x, z.y), d < 600 ? 1 : 0.4);
      const k = H.ease(i / 164);
      window.__cam = { x: S.s.x + Math.cos(S.dir) * 150, y: S.s.y - 10, zoom: 400 + 90 * k, still: true };
      if (i % 15 === 0) return { down: a.down, revive: +(a.revive || 0).toFixed(2), up: S.up, near: Math.round(d) };
    },
  },

  // Back to back: a horde from each end of the street.
  duo_hold: {
    settings: { level: 'city', ally: true, allyWeapon: 'rifle', godMode: true },
    frames: 165,
    setup: async (g) => {
      const H = window.__h;
      const s = await H.findSpot(g, { lit: true, laneX: 720, pick: 4, avoid: [] });
      if (!s) return { err: 'no lane' };
      H.teleport(g, s.x - 26, s.y, Math.PI);
      g.ally.x = s.x + 26; g.ally.y = s.y + 4;
      H.clearAround(g, s.x, s.y, 1300);
      const { Zombie } = await import('/src/game/zombies.js');
      window.__S = { s, Zombie };
      return { spot: [Math.round(s.x), Math.round(s.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, a = g.ally;
      if (i === 4) {
        for (const side of [-1, 1]) {
          for (let k = 0; k < 26; k++) {
            const d = 380 + (k % 7) * 40 + Math.floor(k / 7) * 34;
            const off = ((k * 41) % 11 - 5) * 14;
            const x = S.s.x + side * d, y = S.s.y + off;
            if (g.world.isFree(x, y, 11)) g.zombies.push(new S.Zombie(x, y, true));
          }
        }
      }
      a.hp = 100;
      H.stick(pad, 'move', null, 0);
      let best = null, bd = 1e9;
      for (const z of g.zombies) {
        if (!z.alive || z.type !== 'common' || z.x > p.x + 10) continue;
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d < bd) { bd = d; best = z; }
      }
      if (best) H.stick(pad, 'aim', H.angTo(p, best.x, best.y), bd < 520 ? 1 : 0.4);
      else H.stick(pad, 'aim', Math.PI, 0.4);
      window.__cam = { x: S.s.x, y: S.s.y - 20, zoom: 560 };
      if (i % 15 === 0) return { left: Math.round(bd) };
    },
  },

  // The ferry: both of you up the gangway.
  duo_ferry: {
    settings: { level: 'docks', ally: true, godMode: true, ferryTime: 30 },
    frames: 1060,
    keep: (k) => k >= 925,
    setup: (g) => {
      const H = window.__h, F = g.events.finale;
      if (!F) return { err: 'no finale' };
      H.teleport(g, F.use.x, F.use.y, Math.PI);
      g.ally.x = F.use.x - 60; g.ally.y = F.use.y + 34;
      H.clearAround(g, F.use.x, F.use.y, 1400);
      window.__S = { F };
      return { board: F.board };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, F = S.F, p = g.player, a = g.ally;
      const { z: near, d: nd } = H.nearest(g, p.x, p.y);
      const bx = F.board.x + F.board.w / 2, by = F.board.y + F.board.h / 2;
      const running = F.state === 'docked' && F.gang >= 0.9;
      if (running) {
        const ang = H.angTo(p, bx, by);
        H.stick(pad, 'move', ang, 0.85);
        a.x = p.x - Math.cos(ang) * 46 - Math.sin(ang) * 16;
        a.y = p.y - Math.sin(ang) * 46 + Math.cos(ang) * 16;
        a.vx = 0; a.vy = 0;
      } else H.stick(pad, 'move', null, 0);
      if (near && nd < 560) H.stick(pad, 'aim', H.angTo(p, near.x, near.y), nd < 460 ? 1 : 0.4);
      else H.stick(pad, 'aim', Math.PI, 0.4);
      window.__cam = i < 900 ? { zoom: 640 } : { x: p.x * 0.55 + bx * 0.45, y: p.y * 0.55 + by * 0.45 - 30, zoom: 430 };
      if (i % 30 === 0) return { st: F.state, gang: +F.gang.toFixed(2), won: g.won };
    },
  },
};
