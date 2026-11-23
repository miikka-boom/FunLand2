// Trailer 4: the first trailer's beats, two survivors, no writing in the world (lore and Ben's
// traces off), and a last escape: running from the horde with your friend, shooting back.
const two = require('./shots2.js');

const CLEAN = { lore: false, ben: false };

module.exports = {
  helpers: two.helpers,

  // Two of them leave the first safe room for the dark street.
  t4_open: {
    settings: { level: 'city', ally: true, allyWeapon: 'rifle', godMode: true, ...CLEAN },
    frames: 140,
    setup: async (g) => {
      const H = window.__h;
      const r = g.world.map.startRoom.interior;
      const p = g.player;
      g.ally.x = p.x + 40; g.ally.y = p.y + 24;
      // A few drowsers out in the street, under the lamps.
      const { Zombie } = await import('/src/game/zombies.js');
      const exit = H.downhill(g, p.x, p.y, 48);
      let n = 0;
      for (let k = 0; k < 40 && n < 7; k++) {
        const d = 330 + (k * 53) % 320;
        const a = exit + (((k * 37) % 13) - 6) * 0.09;
        const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
        if (!g.world.isFree(x, y, 12) || g.world.sealedAt(x, y)) continue;
        const z = new Zombie(x, y, false);
        z.wanderStop = k % 3 === 0;
        g.zombies.push(z); n++;
      }
      window.__S = { r, exit };
      return { drowsers: n, exit: +exit.toFixed(2) };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, r = S.r;
      const k = H.ease(i / 139);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      window.__cam = { x: cx + Math.cos(S.exit) * 170 * k, y: cy + Math.sin(S.exit) * 170 * k - 10, zoom: 300 + 260 * k, still: true };
      if (i < 30) { H.stick(pad, 'move', null, 0); H.stick(pad, 'aim', S.exit - 0.3 + 0.3 * (i / 30), 0.38); return; }
      H.stick(pad, 'aim', S.exit + 0.25 * Math.sin(i / 20), 0.38);
      H.stick(pad, 'move', H.downhill(g, p.x, p.y, 48), 0.55);
    },
  },

  // Two lights across the cemetery rows; drowsers caught in them turn at the end.
  t4_dark: {
    settings: { level: 'graveyard', ally: true, godMode: true, ...CLEAN },
    frames: 150,
    setup: async (g) => {
      const H = window.__h;
      const s = await H.findSpot(g, { lit: false, avoid: H.witchAvoid(g), laneY: 300, pick: 25 });
      if (!s) return { err: 'no dark spot' };
      H.teleport(g, s.x, s.y, -Math.PI / 2);
      g.ally.x = s.x + 54; g.ally.y = s.y + 18;
      H.clearAround(g, s.x, s.y, 950);
      H.puppetAlly(g);
      const { Zombie, alertZombie } = await import('/src/game/zombies.js');
      const zs = [];
      for (let k = 0; k < 60 && zs.length < 12; k++) {
        const left = k % 2 === 0;
        const t = (Math.floor(k / 2) % 10) / 9;
        const a = left ? -Math.PI * (0.56 + 0.36 * t) : -Math.PI * (0.44 - 0.36 * t);
        const d = 300 + ((k * 67) % 190);
        const x = s.x + Math.cos(a) * d, y = s.y - 40 + Math.sin(a) * d;
        if (!g.world.isFree(x, y, 12)) continue;
        const z = new Zombie(x, y, false);
        z.wanderStop = true; z.wanderT = 7;
        g.zombies.push(z); zs.push(z);
      }
      window.__S = { s, zs, alertZombie };
      return { spot: [Math.round(s.x), Math.round(s.y)], drowsers: zs.length };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player;
      g.ally.cooldown = 1;
      const k = H.ease(i / 149);
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', -Math.PI * (0.95 - 0.42 * k), 0.4);
      window.__allyFace = -Math.PI * (0.05 + 0.42 * k);
      if (i === 108) S.zs.forEach((z, j) => z.alive && S.alertZombie(g, z, 0.05 + 0.06 * j, false));
      window.__cam = { x: S.s.x + 26, y: S.s.y - 120, zoom: 420, still: true };
    },
  },

  // The Witch: the light on her until she stirs, then light off and back away. The friend keeps close.
  t4_witch: {
    settings: { level: 'graveyard', ally: true, ...CLEAN },
    frames: 165,
    setup: (g) => {
      const H = window.__h;
      const w = g.zombies.find((z) => z.type === 'witch');
      if (!w) return { err: 'no witch in play' };
      const spot = H.spotNear(g, w.x, w.y, Math.PI + 0.12, [440, 400, 480, 360]);
      if (!spot) return { err: 'no spot near her' };
      H.teleport(g, spot.x, spot.y, H.angTo(spot, w.x, w.y));
      const back = H.angTo(w, spot.x, spot.y);
      g.ally.x = spot.x + Math.cos(back) * 50 - Math.sin(back) * 40;
      g.ally.y = spot.y + Math.sin(back) * 50 + Math.cos(back) * 40;
      H.clearAround(g, spot.x, spot.y, 650);
      H.clearAround(g, w.x, w.y, 450);
      window.__S = { w, phase: 'in' };
      return { witch: [Math.round(w.x), Math.round(w.y)], spot: [Math.round(spot.x), Math.round(spot.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, w = S.w;
      const d = Math.hypot(w.x - p.x, w.y - p.y);
      const toW = H.angTo(p, w.x, w.y);
      g.ally.cooldown = 1;
      if (S.phase === 'in' && (w.anger > 0.6 || i > 125)) S.phase = 'out';
      if (S.phase === 'in') {
        H.stick(pad, 'move', d > 205 ? toW : null, 0.62);
        H.stick(pad, 'aim', toW, 0.4);
      } else {
        H.stick(pad, 'aim', toW + Math.PI * 0.75, 0.4);
        H.stick(pad, 'move', toW + Math.PI, 0.5);
      }
      const pk = H.ease(i / 164);
      window.__cam = { x: p.x * (0.5 - 0.12 * pk) + w.x * (0.5 + 0.12 * pk), y: p.y * (0.5 - 0.12 * pk) + w.y * (0.5 + 0.12 * pk) - 10, zoom: 380 - 70 * pk, still: true };
      if (i % 15 === 0) return { d: Math.round(d), anger: +w.anger.toFixed(2), phase: S.phase };
    },
  },

  // HERE THEY COME! drawn across the gas station, then the pumps go up.
  t4_horde: {
    settings: { level: 'city', landmarks: true, ally: true, allyWeapon: 'rifle', godMode: true, ...CLEAN },
    frames: 200,
    setup: async (g) => {
      const H = window.__h;
      const e = g.events.explosives.find((x) => x.id === 'station');
      if (!e) return { err: 'no gas station' };
      const spot = H.spotNear(g, e.x, e.y, Math.PI / 2, [440, 480, 400, 520], 40);
      if (!spot) return { err: 'no spot by the station' };
      H.teleport(g, spot.x, spot.y, spot.a + Math.PI);
      g.ally.x = spot.x + 46; g.ally.y = spot.y + 26;
      H.clearAround(g, spot.x, spot.y, 1100);
      const back = spot.a + Math.PI;
      const pts = [];
      for (let k = 0; k < 64; k++) {
        const d = 150 + (k % 8) * 36 + Math.floor(k / 8) * 24;
        const off = ((((k * 53) % 100) - 50) / 100) * 1.1;
        pts.push([e.x + Math.cos(back + off) * d, e.y + Math.sin(back + off) * d]);
      }
      const { Zombie } = await import('/src/game/zombies.js');
      const { detonate } = await import('/src/game/world-events.js');
      for (const part of e.parts) part.hp = 1e12;
      window.__S = { e, pts, Zombie, detonate, boomAt: -1, spot };
      return { station: [Math.round(e.x), Math.round(e.y)], spot: [Math.round(spot.x), Math.round(spot.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, e = S.e;
      if (i === 4) {
        g.director.forceMob();
        for (const [x, y] of S.pts) if (g.world.isFree(x, y, 11)) g.zombies.push(new S.Zombie(x, y, true));
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
      if (i % 15 === 0) return { atPumps, near: Math.round(nd), boom: e.done };
    },
  },

  // The last escape: the two of them run flat out down a long street, the horde on their heels,
  // shooting back. Tight on the pair first, then the camera pulls out to show what's behind them.
  t4_escape: {
    settings: { level: 'city', ally: true, allyWeapon: 'rifle', godMode: true, hordeSize: 2, ...CLEAN },
    frames: 290,
    setup: async (g) => {
      const H = window.__h;
      const s = await H.findSpot(g, { laneX: 1000, pick: 2, r: 70 });
      if (!s) return { err: 'no long street' };
      const start = { x: s.x - 640, y: s.y };
      H.teleport(g, start.x, start.y, Math.PI);
      g.ally.x = start.x - 10; g.ally.y = start.y + 46;
      H.clearAround(g, s.x, s.y, 1900);
      const { Zombie } = await import('/src/game/zombies.js');
      let n = 0;
      for (let k = 0; k < 200; k++) {
        const d = 110 + (k % 10) * 32 + Math.floor(k / 10) * 24;
        const off = ((((k * 41) % 23) - 11) / 11) * 95;
        const x = start.x - d, y = start.y + off;
        if (g.world.isFree(x, y, 11)) { g.zombies.push(new Zombie(x, y, true)); n++; }
      }
      window.__S = { s, start };
      return { street: [Math.round(s.x), Math.round(s.y)], horde: n };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, a = g.ally;
      a.hp = 100;
      // Your friend runs alongside.
      a.x += (p.x - 12 - a.x) * 0.12;
      a.y += (p.y + 50 - a.y) * 0.12;
      // Keep the horde on your heels: whoever has fallen back catches up a little.
      for (const z of g.zombies) {
        if (!z.alive || z.type !== 'common' || z.x > p.x) continue;
        const gap = p.x - z.x;
        if (gap > 300) z.x += 2.4;
        else if (gap > 200) z.x += 0.9;
      }
      H.stick(pad, 'move', 0, 1);
      let best = null, bd = 1e9;
      for (const z of g.zombies) {
        if (!z.alive || z.type !== 'common' || z.x > p.x + 20) continue;
        const d = Math.hypot(z.x - p.x, z.y - p.y);
        if (d < bd) { bd = d; best = z; }
      }
      if (best) H.stick(pad, 'aim', H.angTo(p, best.x, best.y), bd < 560 ? 1 : 0.4);
      else H.stick(pad, 'aim', Math.PI, 0.4);
      const k = H.ease((i - 110) / 150);
      window.__cam = { x: p.x - 150 - 240 * k, y: p.y + 10, zoom: 460 + 300 * k };
      if (i % 20 === 0) return { px: Math.round(p.x), behind: Math.round(bd), ally: Math.round(Math.hypot(a.x - p.x, a.y - p.y)), alive: g.zombies.filter((z) => z.alive).length };
    },
  },
};
