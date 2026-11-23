// "Where is Ben?": the traces of the one they left behind, found by flashlight in the dark.
const base = require('./shots.js');

module.exports = {
  helpers: base.helpers,

  // The first safe room: DAY 1 HERE. DAY 2 LEAVING. / day 3. you left. ... and the rabbit.
  wall: {
    settings: { level: 'city', witch: false },
    frames: 108,
    setup: (g) => {
      const H = window.__h;
      const r = g.world.map.startRoom.interior;
      const day3 = g.world.map.decor.find((d) => d.type === 'bentext' && /day 3/.test(d.text));
      const rabbit = g.world.map.decor.find((d) => d.type === 'rabbit' && !d.nest);
      const out = H.spotNear(g, r.x + r.w / 2, r.y + r.h / 2, 0, [220, 260, 300], 20) || { x: r.x + r.w - 20, y: r.y + r.h - 18 };
      H.teleport(g, out.x, out.y, Math.PI);
      window.__S = { day3, rabbit };
      return { day3: [Math.round(day3.x), Math.round(day3.y)], rabbit: [Math.round(rabbit.x), Math.round(rabbit.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S;
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', -Math.PI * 0.8, 0.38);
      const k = H.ease((i - 48) / 60);
      window.__cam = {
        x: S.day3.x + (S.rabbit.x + 30 - S.day3.x) * k,
        y: S.day3.y - 8 + (S.rabbit.y - 30 - S.day3.y + 8) * k,
        zoom: 165 - 15 * H.ease(i / 107), still: true,
      };
    },
  },

  // NOBODY TALKS ABOUT BEN — LOU / lou does. at night.
  lou: {
    settings: { level: 'docks', witch: false },
    frames: 114,
    setup: (g) => {
      const H = window.__h;
      const gr = g.world.map.decor.find((d) => d.type === 'graffiti' && /NOBODY TALKS ABOUT BEN/.test(d.text || ''));
      const re = g.world.map.decor.find((d) => d.type === 'bentext' && /lou does/.test(d.text));
      const T = { x: (gr.x + re.x) / 2, y: (gr.y + re.y) / 2 };
      const s = H.spotNear(g, T.x, T.y, Math.PI / 2, [240, 210, 270, 180, 150], 24);
      if (!s) return { err: 'no spot' };
      H.teleport(g, s.x, s.y, -Math.PI / 2);
      H.clearAround(g, T.x, T.y, 1000);
      window.__S = { T, s };
      return { T: [Math.round(T.x), Math.round(T.y)], spot: [Math.round(s.x), Math.round(s.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player;
      const toT = H.angTo(p, S.T.x, S.T.y);
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', toT - 0.75 * (1 - H.ease(i / 62)), 0.38);
      window.__cam = { x: S.T.x, y: S.T.y + 6, zoom: 235 - 25 * H.ease(i / 113), still: true };
    },
  },

  // Small footprints that walk up to a wall and stop at an open vent.
  prints: {
    settings: { level: 'city', witch: false },
    frames: 108,
    setup: (g) => {
      const H = window.__h, map = g.world.map;
      const fp = map.decor.find((d) => d.type === 'footprints');
      const v = map.decor.find((d) => d.type === 'vent' && d.open);
      const first = fp.pts[fp.pts.length - 1];
      const ang = Math.atan2(first[1] - v.y, first[0] - v.x);
      const s = H.spotNear(g, v.x, v.y, ang, [340, 300, 380, 260], 24);
      if (!s) return { err: 'no spot' };
      H.teleport(g, s.x, s.y, ang + Math.PI);
      H.clearAround(g, v.x, v.y, 1000);
      window.__S = { first, v, s, cx: (first[0] + v.x) / 2, cy: (first[1] + v.y) / 2 };
      return { first: first.map(Math.round), vent: [Math.round(v.x), Math.round(v.y)], spot: [Math.round(s.x), Math.round(s.y)], n: fp.pts.length };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player;
      const k = H.ease(i / 92);
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', H.angTo(p, S.first[0] + (S.v.x - S.first[0]) * k, S.first[1] + (S.v.y - S.first[1]) * k), 0.38);
      const kc = H.ease(i / 100);
      window.__cam = { x: S.first[0] + (S.v.x - S.first[0]) * (0.25 + 0.6 * kc), y: S.first[1] + (S.v.y - S.first[1]) * (0.25 + 0.6 * kc), zoom: 150 - 25 * kc, still: true };
    },
  },

  // The glimpse: two little eyes catch the light, blink, and are gone.
  glimpse: {
    settings: { level: 'city', witch: false },
    frames: 120,
    setup: (g) => {
      const H = window.__h;
      const gl = g.world.map.ben.glimpse;
      const s = H.spotNear(g, gl.x, gl.y, Math.PI / 2 + 0.3, [380, 340, 420, 300], 24);
      if (!s) return { err: 'no spot' };
      const to = Math.atan2(gl.y - s.y, gl.x - s.x);
      H.teleport(g, s.x, s.y, to - 0.95);
      H.clearAround(g, gl.x, gl.y, 1100);
      window.__S = { gl, s, to };
      return { glimpse: [Math.round(gl.x), Math.round(gl.y)], spot: [Math.round(s.x), Math.round(s.y)], ben: !!g.ben, keys: g.ben ? Object.keys(g.ben) : null };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player;
      let off;
      if (i < 55) off = -0.95 + 0.4 * H.ease(i / 55);
      else if (i < 74) off = -0.55;
      else off = -0.55 + 0.55 * H.ease((i - 74) / 9);
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', S.to + off, 0.38);
      window.__cam = { x: S.gl.x, y: S.gl.y + 30, zoom: 175 - 15 * H.ease(i / 119), still: true };
      const G = g.ben && g.ben.glimpse;
      if (i % 5 === 0 && G) return { st: G.state, lit: +(G.lit || 0).toFixed(2), litT: +(G.litT || 0).toFixed(2) };
    },
  },

  // Where nobody could reach: crane 3's boom (ben was here. day 1.), then a raft out on the water.
  reach: {
    settings: { level: 'docks', witch: false },
    frames: 114,
    setup: (g) => {
      const H = window.__h, map = g.world.map;
      const c = map.cranes[2];
      const raft = map.decor.find((d) => d.type === 'raft');
      const cy = (c.y + c.y1) / 2;
      let s = null;
      for (const x of [c.x1 + 30, c.x1 + 60, c.x1 - 20, c.x0 + 40]) if (!s && g.world.isFree(x, cy, 24)) s = { x, y: cy };
      if (!s) return { err: 'no spot' };
      H.teleport(g, s.x, s.y, 0);
      H.clearAround(g, s.x, s.y, 1100);
      window.__S = { c, raft, s, cy };
      return { crane: c, raft: [Math.round(raft.x), Math.round(raft.y)], spot: [Math.round(s.x), Math.round(s.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player;
      const k = H.ease((i - 40) / 70);
      const bx = S.c.x1 + S.c.boom * 0.45, by = S.cy;
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', H.angTo(p, S.raft.x, S.raft.y), 0.38);
      window.__cam = { x: bx + (S.raft.x - bx) * k, y: by + (S.raft.y - by) * k, zoom: 360 - 40 * H.ease(i / 113), still: true };
    },
  },

  // His bed: a cardboard fort, a candle still burning, a can still steaming. "i left the light on."
  bed: {
    settings: { level: 'city', witch: false },
    frames: 156,
    setup: (g) => {
      const H = window.__h;
      const n = g.world.map.ben.nest;
      const s = H.spotNear(g, n.mouth.x, n.mouth.y, Math.atan2(n.mouth.y - n.y, n.mouth.x - n.x), [150, 120, 180, 95], 20);
      if (!s) return { err: 'no spot' };
      H.teleport(g, s.x, s.y, H.angTo(s, n.x, n.y));
      H.clearAround(g, n.x, n.y, 1000);
      g.pickups = g.pickups.filter((k) => Math.hypot(k.x - n.mouth.x, k.y - n.mouth.y) > 90);
      // His line runs into the building beside the alley on this seed: stage it under the fort, a little smaller.
      const line = g.world.map.decor.find((d) => d.type === 'bentext' && /light on/.test(d.text));
      if (line) { line.x = n.x + 1; line.y = n.mouth.y - 18; line.size = 6.6; line.a = 0; }
      window.__S = { n, s };
      return { nest: [Math.round(n.x), Math.round(n.y)], mouth: n.mouth, spot: [Math.round(s.x), Math.round(s.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, n = S.n;
      const k = H.ease(i / 155);
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', H.angTo(p, n.x, n.y), 0.38);
      window.__cam = { x: n.x + 14, y: n.y + 24 - 6 * k, zoom: 200 - 92 * k, still: true };
    },
  },

  // "my squad": five holding hands, Biscuit, and one more in orange, standing apart.
  squad: {
    settings: { level: 'city', witch: false },
    frames: 78,
    setup: (g) => {
      const H = window.__h;
      const d = g.world.map.decor.find((x) => x.type === 'benchalk' && x.kind === 'drawing');
      const s = H.spotNear(g, d.x, d.y, Math.PI / 2, [190, 160, 220, 130], 20);
      if (!s) return { err: 'no spot' };
      H.teleport(g, s.x, s.y, -Math.PI / 2);
      H.clearAround(g, d.x, d.y, 1000);
      window.__S = { d, s };
      return { drawing: [Math.round(d.x), Math.round(d.y)], w: d.w, h: d.h, spot: [Math.round(s.x), Math.round(s.y)] };
    },
    direct: (i, g, pad) => {
      const H = window.__h, S = window.__S, p = g.player, d = S.d;
      const k = H.ease(i / 77);
      H.stick(pad, 'move', null, 0);
      H.stick(pad, 'aim', H.angTo(p, d.x - 30 + 60 * k, d.y), 0.38);
      window.__cam = { x: d.x - 28 + 56 * k, y: d.y + 2, zoom: 160, still: true };
    },
  },
};
