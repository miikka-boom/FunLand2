// Shot list for the trailer. setup(g, P) runs in the page on the title screen (before the run
// starts); direct(i, g, pad, P) runs in the page before each frame. window.__h holds helpers,
// window.__S a shot's own state, window.__cam the directed camera ({x, y, zoom, still}).

function helpers() {
  const H = {};
  // Heading (radians) that walks toward the goal, or null at a dead end.
  H.downhill = (g, x, y, step = 30) => {
    const F = g.goalField;
    let best = null;
    let bd = F.pathDist(x, y);
    for (let k = 0; k < 24; k++) {
      const a = (k * Math.PI) / 12;
      const d = F.pathDist(x + Math.cos(a) * step, y + Math.sin(a) * step);
      if (Number.isFinite(d) && d < bd - 1) { bd = d; best = a; }
    }
    return best;
  };
  H.alongWalk = (g, x, y, dist) => {
    let px = x, py = y;
    for (let s = 0; s < dist; s += 20) {
      const a = H.downhill(g, px, py, 20);
      if (a === null) break;
      px += Math.cos(a) * 20; py += Math.sin(a) * 20;
    }
    return { x: px, y: py };
  };
  // A stick as a screen direction (y down) and a magnitude; 'aim' below 0.5 aims without firing.
  H.stick = (pad, which, ang, mag) => {
    const i = which === 'move' ? 0 : 2;
    if (ang === null || ang === undefined || !mag) { pad.axes[i] = 0; pad.axes[i + 1] = 0; return; }
    pad.axes[i] = Math.cos(ang) * mag; pad.axes[i + 1] = Math.sin(ang) * mag;
  };
  H.angTo = (a, x, y) => Math.atan2(y - a.y, x - a.x);
  H.ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  H.drowsers = async (g, pts, awake = false) => {
    const { Zombie } = await import('/src/game/zombies.js');
    let n = 0;
    for (const [x, y] of pts) if (g.world.isFree(x, y, 12)) { g.zombies.push(new Zombie(x, y, awake)); n++; }
    return n;
  };
  H.clearAround = (g, x, y, r) => { for (const z of g.zombies) if (z.type === 'common' && Math.hypot(z.x - x, z.y - y) < r) z.alive = false; };
  H.teleport = (g, x, y, facing) => {
    const p = g.player;
    p.x = x; p.y = y; p.vx = 0; p.vy = 0;
    if (facing !== undefined) { p.facing = facing; p.aimAngle = facing; p.fireAngle = facing; }
  };
  // Nearest live threat (not a seated Witch) to a point.
  H.nearest = (g, x, y) => {
    let near = null, nd = 1e9;
    for (const z of g.zombies) {
      if (!z.alive || (z.type === 'witch' && z.passive)) continue;
      const d = Math.hypot(z.x - x, z.y - y);
      if (d < nd) { nd = d; near = z; }
    }
    return { z: near, d: nd };
  };
  // A free spot about `dist` from (cx, cy) around heading `ang`, with a clear line to it.
  H.spotNear = (g, cx, cy, ang, dists, clear = 30) => {
    const W = g.world;
    for (const d of dists) {
      for (let k = 0; k < 24; k++) {
        const a = ang + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.13;
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (!W.isFree(x, y, clear) || !Number.isFinite(W.flow.pathDist(x, y)) || !W.segmentClear(x, y, cx, cy)) continue;
        return { x, y, a };
      }
    }
    return null;
  };
  return H;
}

module.exports = {
  helpers,

  // 1. Cold open: the first safe room, "DAY 1 HERE. DAY 2 LEAVING." and, in crayon, "day 3. you left."
  open: {
    settings: { level: 'city' },
    frames: 135,
    setup: (g) => {
      const r = g.world.map.startRoom.interior;
      window.__S = { r };
      return { p: [Math.round(g.player.x), Math.round(g.player.y)], room: r };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, r = S.r;
      const k = H.ease(i / 134);
      window.__cam = { x: r.x + r.w / 2 + 60 * H.ease((i - 50) / 85), y: r.y + 52 + 50 * k, zoom: 210 + 230 * k, still: true };
      if (i < 40) { H.stick(pad, 'move', null, 0); H.stick(pad, 'aim', -Math.PI / 2 - 0.3 + 0.6 * (i / 40), 0.38); return; }
      H.stick(pad, 'aim', null, 0);
      H.stick(pad, 'move', H.downhill(g, p.x, p.y, 48), 0.62);
    },
  },

  // 2. The dark: a flashlight sweep across the cemetery rows, drowsers caught in the beam.
  dark: {
    settings: { level: 'graveyard', godMode: true },
    frames: 150,
    setup: async (g) => {
      const H = window.__h, W = g.world, map = W.map;
      const w = g.zombies.find((z) => z.type === 'witch');
      const { lightAt } = await import('/src/game/terror.js');
      const sr = map.startRoom.interior, er = map.endRoom.interior;
      let spot = null;
      // Somewhere dark among the rows, away from the Witch, the safe rooms and the lanterns.
      for (let gy = 0.3; gy <= 0.75 && !spot; gy += 0.05) {
        for (let gx = 0.3; gx <= 0.7 && !spot; gx += 0.04) {
          const x = map.w * gx, y = map.h * gy;
          if (!W.isFree(x, y, 50) || !Number.isFinite(W.flow.pathDist(x, y))) continue;
          if (w && Math.hypot(x - w.x, y - w.y) < 1100) continue;
          if (Math.hypot(x - sr.x, y - sr.y) < 1000 || Math.hypot(x - er.x, y - er.y) < 800) continue;
          let dark = true;
          for (const [ox, oy] of [[0, 0], [0, -250], [-250, -150], [250, -150]]) if (lightAt(g, x + ox, y + oy) > 0.05) dark = false;
          if (dark) spot = { x, y };
        }
      }
      if (!spot) return { err: 'no dark spot' };
      H.teleport(g, spot.x, spot.y, -Math.PI / 2);
      H.clearAround(g, spot.x, spot.y, 800);
      const { Zombie, alertZombie } = await import('/src/game/zombies.js');
      const zs = [];
      for (let k = 0; k < 11; k++) {
        const a = -Math.PI * (0.9 - (0.8 * k) / 10);
        const d = 300 + ((k * 71) % 190);
        const x = spot.x + Math.cos(a) * d, y = spot.y + Math.sin(a) * d;
        if (!W.isFree(x, y, 12)) continue;
        const z = new Zombie(x, y, false);
        z.wanderStop = true; z.wanderT = 6;
        g.zombies.push(z); zs.push(z);
      }
      const n = zs.length;
      window.__S = { x: spot.x, y: spot.y, zs, alertZombie };
      return { spot: [Math.round(spot.x), Math.round(spot.y)], drowsers: n, witchDist: w ? Math.round(Math.hypot(spot.x - w.x, spot.y - w.y)) : null };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S;
      const k = H.ease(i / 149);
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', -Math.PI * 0.93 + Math.PI * 0.86 * k, 0.4);
      if (i === 104) S.zs.forEach((z, j) => z.alive && S.alertZombie(g, z, 0.05 + 0.07 * j, false));
      window.__cam = { x: S.x, y: S.y - 110, zoom: 390, still: true };
    },
  },

  // 3. The Witch: walk in with the light on her until she stirs, then light off and back away.
  witch: {
    settings: { level: 'graveyard' },
    frames: 165,
    setup: (g) => {
      const H = window.__h;
      const w = g.zombies.find((z) => z.type === 'witch');
      if (!w) return { err: 'no witch in play' };
      const spot = H.spotNear(g, w.x, w.y, Math.PI + 0.12, [440, 400, 480, 360]);
      if (!spot) return { err: 'no spot near her' };
      H.teleport(g, spot.x, spot.y, H.angTo(spot, w.x, w.y));
      H.clearAround(g, spot.x, spot.y, 600);
      H.clearAround(g, w.x, w.y, 450);
      window.__S = { w, phase: 'in' };
      return { witch: [Math.round(w.x), Math.round(w.y)], spot: [Math.round(spot.x), Math.round(spot.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, w = S.w;
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      const toW = H.angTo(p, w.x, w.y);
      if (S.phase === 'in' && (w.anger > 0.6 || i > 125)) S.phase = 'out';
      if (S.phase === 'in') {
        H.stick(pad, 'move', d > 205 ? toW : null, 0.62);
        H.stick(pad, 'aim', toW, 0.4);
      } else {
        H.stick(pad, 'aim', toW + Math.PI * 0.75, 0.4);
        H.stick(pad, 'move', toW + Math.PI, 0.5);
      }
      const pk = H.ease(i / 164);
      window.__cam = { x: p.x * (0.5 - 0.15 * pk) + w.x * (0.5 + 0.15 * pk), y: p.y * (0.5 - 0.15 * pk) + w.y * (0.5 + 0.15 * pk) - 10, zoom: 370 - 90 * pk, still: true };
      if (i % 15 === 0) return { d: Math.round(d), anger: +w.anger.toFixed(2), mode: w.mode, phase: S.phase };
    },
  },

  // 4. The horde: "HERE THEY COME!" on the streets, drawn across the gas station, then the pumps go up.
  horde: {
    settings: { level: 'city', landmarks: true, ally: true, allyWeapon: 'rifle', godMode: true },
    frames: 300,
    setup: async (g) => {
      const H = window.__h;
      const e = g.events.explosives.find((x) => x.id === 'station');
      if (!e) return { err: 'no gas station' };
      const spot = H.spotNear(g, e.x, e.y, Math.PI / 2, [440, 480, 400, 520], 40);
      if (!spot) return { err: 'no spot by the station' };
      H.teleport(g, spot.x, spot.y, spot.a + Math.PI);
      if (g.ally) { g.ally.x = spot.x + 46; g.ally.y = spot.y + 26; }
      H.clearAround(g, spot.x, spot.y, 1100);
      const back = spot.a + Math.PI;
      const pts = [];
      for (let k = 0; k < 56; k++) {
        const d = 150 + (k % 8) * 36 + Math.floor(k / 8) * 24;
        const off = ((((k * 53) % 100) - 50) / 100) * 1.1;
        pts.push([e.x + Math.cos(back + off) * d, e.y + Math.sin(back + off) * d]);
      }
      const { Zombie } = await import('/src/game/zombies.js');
      const { detonate } = await import('/src/game/world-events.js');
      for (const part of e.parts) part.hp = 1e12;
      window.__S = { e, pts, Zombie, detonate, boomAt: -1, spot };
      return { station: [Math.round(e.x), Math.round(e.y)], spot: [Math.round(spot.x), Math.round(spot.y)], ally: !!g.ally };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, e = S.e;
      if (i === 4) {
        g.director.forceMob();
        let n = 0;
        for (const [x, y] of S.pts) if (g.world.isFree(x, y, 11)) { g.zombies.push(new S.Zombie(x, y, true)); n++; }
        S.added = n;
      }
      let atPumps = 0;
      for (const z of g.zombies) if (z.alive && z.type === 'common' && Math.hypot(z.x - e.x, z.y - e.y) < 210) atPumps++;
      const { z: near, d: nd } = H.nearest(g, p.x, p.y);
      if (!e.done && S.boomAt < 0 && i > 45 && (atPumps >= 16 || i > 170)) S.boomAt = i;
      if (!e.done && S.boomAt >= 0) {
        H.stick(pad, 'aim', H.angTo(p, e.x, e.y), 1);
        if (i - S.boomAt >= 9) S.detonate(g, e);
      } else if (near && nd < 680) {
        H.stick(pad, 'aim', H.angTo(p, near.x, near.y), nd < 620 ? 1 : 0.4);
      } else {
        H.stick(pad, 'aim', H.angTo(p, e.x, e.y), 0.4);
      }
      pad.buttons[5] = near && nd < 58 && i % 9 === 0 ? 1 : 0;
      H.stick(pad, 'move', null, 0);
      window.__cam = { x: p.x * 0.5 + e.x * 0.5, y: p.y * 0.5 + e.y * 0.5 - 30, zoom: 640 };
      if (i % 15 === 0) return { atPumps, near: Math.round(nd), boom: e.done, added: S.added };
    },
  },

  // 5. Pier 9: the flare, the waves down the pier, the LIBERTY BELLE coming in, the gangway.
  pier: {
    settings: { level: 'docks', ally: true, godMode: true, ferryTime: 30 },
    frames: 1080,
    keep: (k) => k < 110 || (k >= 520 && k < 760) || k >= 890,
    setup: (g) => {
      const H = window.__h, F = g.events.finale;
      if (!F) return { err: 'no finale' };
      H.teleport(g, F.use.x, F.use.y, Math.PI);
      if (g.ally) { g.ally.x = F.use.x - 70; g.ally.y = F.use.y + 34; }
      H.clearAround(g, F.use.x, F.use.y, 1400);
      window.__S = { F };
      return { use: F.use, flare: F.flare, board: F.board, gangX: F.gangX, ship: F.ship, pier: F.pier };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, F = S.F, p = g.player;
      const { z: near, d: nd } = H.nearest(g, p.x, p.y);
      if (F.state === 'docked' && F.gang >= 0.9) {
        const bx = F.board.x + F.board.w / 2, by = F.board.y + F.board.h / 2;
        H.stick(pad, 'move', H.angTo(p, bx, by), 0.9);
      } else {
        H.stick(pad, 'move', null, 0);
      }
      if (near && nd < 560) H.stick(pad, 'aim', H.angTo(p, near.x, near.y), nd < 460 ? 1 : 0.4);
      else H.stick(pad, 'aim', Math.PI, 0.4);
      window.__cam = { x: F.flare.x - 270, y: F.pier.y + 20, zoom: 720 };
      if (i % 30 === 0) return { st: F.state, t: +F.t.toFixed(1), shipX: Math.round(F.shipX), gang: +F.gang.toFixed(2), near: Math.round(nd), won: g.won };
    },
  },
};
