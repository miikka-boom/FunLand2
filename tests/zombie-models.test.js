// The horde's 3D zombie models (assets/zombies/, tools/zombies/build_zombies.py): the parts as
// built from the FBX, the looks, the sprite baker (src/render/zombie-bake.js) and the drawing
// (src/render/zombie-art.js): draw order, darkness, the budget, corpses, and the renderer drawing
// a horde with them on a mock canvas.
// (node --test runs each file in its own process, so the fake DOM globals stay here.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const calls = [];
let bad = null;
function mockCtx(canvas) {
  const t = { canvas, globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', lineCap: 'butt', lineJoin: 'miter', textAlign: 'left', textBaseline: 'top', lineDashOffset: 0 };
  return new Proxy(t, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w ?? x) * (h ?? y) * 4)) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...a) => {
        if (k === 'drawImage') calls.push({ alpha: o.globalAlpha, op: o.globalCompositeOperation, a });
        for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) bad = bad || `${String(k)}(${a.join(', ')})`;
      };
    },
    set(o, k, v) {
      o[k] = v;
      return true;
    },
  });
}
function mockCanvas(w = 300, h = 150) {
  const c = { width: w, height: h, style: {} };
  c.getContext = () => c._ctx || (c._ctx = mockCtx(c));
  return c;
}
const store = new Map();
globalThis.document = { createElement: () => mockCanvas() };
globalThis.window = { devicePixelRatio: 2 };
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

const M = await import('../assets/zombies/meshes.js');
const { decodeMesh, Texture, bake, overlap } = await import('../src/render/zombie-bake.js');
const { ZombieArt, orderFor, tiltPitches, DIRS, ARM_PITCH, FOOT_L, FOOT_R, TORSO, ARM_L, ARM_R, HEAD } = await import('../src/render/zombie-art.js');
const { LOOKS, pickLook } = await import('../src/game/zombie-looks.js');
const { Zombie } = await import('../src/game/zombies.js');
const { IsoView } = await import('../src/iso.js');
const { DEFAULTS, SCHEMA } = await import('../src/settings.js');

const NP = ARM_PITCH.length;
const DEG = Math.PI / 180;

/** A small stand-in for the texture: the palette strip black, everything else a light grey. */
function testTexture() {
  const N = 64;
  const px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N;
      const v = 1 - (y + 0.5) / N;
      const pal = u >= M.PALETTE[0] && u <= M.PALETTE[2] && v >= M.PALETTE[1] && v <= M.PALETTE[3];
      const o = (y * N + x) * 4;
      px[o] = px[o + 1] = px[o + 2] = pal ? 0 : 200;
      px[o + 3] = 255;
    }
  }
  return new Texture(N, N, px);
}
const TEX = testTexture();
const allMeshes = () => [
  ['foot', M.FOOT],
  ...Object.entries(M.BODIES).flatMap(([k, b]) => [[`${k} torso`, b.torso], [`${k} arm`, b.arm]]),
  ...Object.entries(M.HEADS).map(([k, h]) => [`head ${k}`, h.mesh]),
];

/** A page that keeps the sprites it is given, for looking at them. */
function memoryPage() {
  return { canvas: mockCanvas(), puts: 0, put() { this.puts++; }, flush() {}, seal() {} };
}

test('the built parts: two bodies, one foot, six heads; every mesh decodes whole', () => {
  assert.deepEqual(Object.keys(M.BODIES).sort(), ['big', 'normal']);
  assert.deepEqual(Object.keys(M.HEADS).sort(), ['bald', 'baldB', 'ponytail', 'swept', 'wide', 'wideBig']);
  assert.deepEqual(Object.keys(M.BLOCKS).sort(), ['A', 'B', 'C', 'D']);
  for (const [name, m] of allMeshes()) {
    const d = decodeMesh(m);
    assert.equal(d.pos.length, d.n * 3, name);
    assert.equal(d.tri.length % 3, 0, name);
    assert.ok(d.tri.length / 3 > 50, `${name}: a real mesh`);
    for (const i of d.tri) assert.ok(i < d.n, `${name}: corner in range`);
    for (const x of d.pos) assert.ok(Number.isFinite(x) && Math.abs(x) < 600, `${name}: position`);
    for (let i = 0; i < d.n; i++) {
      const l = Math.hypot(d.nrm[i * 3], d.nrm[i * 3 + 1], d.nrm[i * 3 + 2]);
      assert.ok(Math.abs(l - 1) < 1e-3, `${name}: unit normal`);
      // UVs stay on the texture in every colour block (the palette doesn't move).
      for (const [du, dv] of Object.values(M.BLOCKS)) {
        const u = d.uv[i * 2] + (d.pal[i] ? 0 : du);
        const v = d.uv[i * 2 + 1] + (d.pal[i] ? 0 : dv);
        assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${name}: uv on the texture`);
      }
    }
    // Every piece has its black outline shell: palette UVs are a fair share of the mesh.
    const pal = d.pal.reduce((s, x) => s + x, 0);
    assert.ok(pal > d.n * 0.25, `${name}: has outline shells`);
  }
  for (const b of Object.values(M.BODIES)) {
    assert.ok(b.shoulders[0][1] < 0 && b.shoulders[1][1] > 0, 'left shoulder on the left, right on the right');
    assert.ok(b.feet[0][1] < 0 && b.feet[1][1] > 0, 'feet likewise');
    assert.ok(b.neck > b.shoulders[0][2], 'the head sits above the arms');
  }
  assert.ok(M.BODIES.big.neck > M.BODIES.normal.neck, 'the big one is taller');
  // The texture beside them: a 1024 px PNG.
  const png = fs.readFileSync(new URL('../assets/zombies/zombies.png', import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), M.TEXTURE_SIZE);
  assert.equal(png.readUInt32BE(20), M.TEXTURE_SIZE);
});

test('looks: the six authored zombies come first, every look is a real body, head and block, and pickLook reaches them all', () => {
  assert.deepEqual(
    LOOKS.slice(0, 6).map(({ body, head, block }) => ({ body, head, block })),
    M.AUTHORED,
  );
  for (const l of LOOKS) {
    assert.ok(M.BODIES[l.body] && M.HEADS[l.head] && M.BLOCKS[l.block], JSON.stringify(l));
    assert.equal(M.HEADS[l.head].body, l.body, `${l.head} is made for the ${M.HEADS[l.head].body} body`);
    assert.ok(l.weight > 0);
  }
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(pickLook(i / 2000));
  assert.equal(seen.size, LOOKS.length);
  assert.equal(pickLook(0.999999), LOOKS.length - 1);
  const z = new Zombie(0, 0);
  assert.ok(Number.isInteger(z.look) && z.look >= 0 && z.look < LOOKS.length, 'every common gets a look');
});

test('baker: what faces the camera is what shows (the winding culls the far side), and the outline rims it', () => {
  const torso = decodeMesh(M.BODIES.normal.torso);
  // Straight down: the top of the torso shows, not its bottom.
  const s = bake([{ mesh: torso }], TEX, { phi: 0, sp: 1, cp: 0, ppu: 0.2, ss: 1 });
  const mid = Math.round(s.oy) * s.w + Math.round(s.ox);
  assert.ok(s.depth[mid] > 150, `the top (depth ${s.depth[mid]}) is in front`);
  // The edge of the sprite is outline black; the middle is the grey skin.
  let edge = 0;
  let dark = 0;
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      const o = (y * s.w + x) * 4;
      if (s.rgba[o + 3] < 200) continue;
      const outside = (dx, dy) => {
        const X = x + dx;
        const Y = y + dy;
        return X < 0 || Y < 0 || X >= s.w || Y >= s.h || s.rgba[(Y * s.w + X) * 4 + 3] < 50;
      };
      if (outside(1, 0) || outside(-1, 0) || outside(0, 1) || outside(0, -1)) {
        edge++;
        if (s.rgba[o] < 60) dark++;
      }
    }
  }
  assert.ok(edge > 20 && dark / edge > 0.8, `outline: ${dark} of ${edge} edge pixels dark`);
  assert.ok(s.rgba[mid * 4] > 150, 'the middle is skin, not outline');
  // Facing the camera vs. facing away: the sprite turns, the pivot stays inside it.
  for (let d = 0; d < 8; d++) {
    const t = bake([{ mesh: torso }], TEX, { phi: (d / 8) * Math.PI * 2, sp: Math.sin(60 * DEG), cp: Math.cos(60 * DEG), ppu: 0.2, ss: 2 });
    assert.ok(t.ox > 0 && t.ox < t.w && t.oy > 0 && t.oy < t.h, 'pivot inside the sprite');
  }
});

test('baker: a colour block moves the painted UVs, never the palette (eyes stay white, outlines black)', () => {
  // A texture with block B painted red and block A painted blue; palette as usual.
  const N = 64;
  const px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N;
      const v = 1 - (y + 0.5) / N;
      const o = (y * N + x) * 4;
      const pal = u >= M.PALETTE[0] && u <= M.PALETTE[2] && v >= M.PALETTE[1] && v <= M.PALETTE[3];
      const white = pal && v > 0.94; // the eye-white swatch at the top of the strip
      px[o] = pal ? (white ? 255 : 0) : u < 0.48 ? 220 : 30;
      px[o + 1] = pal ? (white ? 255 : 0) : 30;
      px[o + 2] = pal ? (white ? 255 : 0) : u < 0.48 ? 30 : 220;
      px[o + 3] = 255;
    }
  }
  const tex = new Texture(N, N, px);
  const head = decodeMesh(M.HEADS.bald.mesh);
  const o = { phi: Math.PI / 2, sp: Math.sin(30 * DEG), cp: Math.cos(30 * DEG), ppu: 0.25, ss: 1 };
  const count = (s) => {
    const c = { red: 0, blue: 0, white: 0 };
    for (let i = 0; i < s.rgba.length; i += 4) {
      if (s.rgba[i + 3] < 200) continue;
      const [r, g, b] = [s.rgba[i], s.rgba[i + 1], s.rgba[i + 2]];
      if (r > 150 && g > 150 && b > 150) c.white++;
      else if (r > 100 && b < 60) c.red++;
      else if (b > 100 && r < 60) c.blue++;
    }
    return c;
  };
  const inB = count(bake([{ mesh: head, shift: M.BLOCKS.B }], tex, o));
  const inA = count(bake([{ mesh: head, shift: M.BLOCKS.A }], tex, o));
  assert.ok(inB.red > 50 && inB.blue === 0, 'block B paints from the left half');
  assert.ok(inA.blue > 50 && inA.red === 0, 'block A paints from the right half');
  assert.ok(inA.white > 10 && Math.abs(inA.white - inB.white) < 3, 'the eyes are white in both');
});

test('draw order: feet first, the torso before the head, arms in front when they reach at you and behind when it turns away', () => {
  // Upright, and leaning toward the camera with the head tipped further (as the settings have it).
  for (const [tilt, headTilt] of [[75, 75], [45, 45], [55, 35], [65, 30]]) {
    const b = { sp: Math.sin(tilt * DEG), cp: Math.cos(tilt * DEG) };
    const h = { sp: Math.sin(headTilt * DEG), cp: Math.cos(headTilt * DEG) };
    for (const [bodyId, headId] of [['normal', 'bald'], ['normal', 'ponytail'], ['big', 'wideBig']]) {
      const body = M.BODIES[bodyId];
      const head = M.HEADS[headId];
      for (let d = 0; d < DIRS; d += 4) {
        const ord = orderFor(body, head, TEX, b, h, d);
        for (let k = 0; k < NP * NP; k++) {
          const o = Array.from(ord.slice(k * 6, k * 6 + 6));
          assert.deepEqual([...o].sort(), [0, 1, 2, 3, 4, 5], 'each part once');
          const at = (p) => o.indexOf(p);
          assert.ok(at(FOOT_L) < at(TORSO) && at(FOOT_R) < at(TORSO), `${bodyId}/${headId} ${tilt}° d${d}: feet under the torso`);
          assert.ok(at(TORSO) < at(HEAD), `${bodyId}/${headId} ${tilt}° d${d}: the head on the torso`);
        }
      }
      // Reaching (pose 2) straight at the camera: both arms in front of the torso. Turned away: behind it.
      const toward = orderFor(body, head, TEX, b, h, DIRS / 4).slice((2 * NP + 2) * 6, (2 * NP + 2) * 6 + 6);
      const away = orderFor(body, head, TEX, b, h, (DIRS * 3) / 4).slice((2 * NP + 2) * 6, (2 * NP + 2) * 6 + 6);
      const ix = (o, p) => Array.from(o).indexOf(p);
      assert.ok(ix(toward, ARM_L) > ix(toward, TORSO) && ix(toward, ARM_R) > ix(toward, TORSO), `${bodyId} ${tilt}°: arms reach in front`);
      // (The big one's shoulders are the top of its torso: seen from high up, its arms' roots lie on it either way.)
      if (bodyId === 'normal') assert.ok(ix(away, ARM_L) < ix(away, TORSO) && ix(away, ARM_R) < ix(away, TORSO), `${bodyId} ${tilt}°: arms behind when it turns away`);
      assert.ok(ix(away, HEAD) === 5, 'turned away, the back of the head is the nearest thing');
    }
  }
});

test('lean: bodies drawn as if the camera were lower, heads lower still; never below the floors', () => {
  const t = (pitch, lean, head) => tiltPitches(pitch * DEG, lean * DEG, head * DEG).map((x) => Math.round(x / DEG));
  assert.deepEqual(t(75, 20, 20), [55, 35], 'the streets camera');
  assert.deepEqual(t(70, 20, 20), [50, 30], 'the building camera');
  assert.deepEqual(t(90, 20, 20), [70, 50], 'straight down');
  assert.deepEqual(t(45, 20, 20), [35, 20], 'a low camera leans them less');
  assert.deepEqual(t(25, 20, 20), [25, 20], 'lower than the floor: the body stays, the head still turns a little');
  assert.deepEqual(t(75, 0, 0), [75, 75], 'no lean: the true camera');
  assert.deepEqual(t(75, 0, 30), [75, 45], 'the head on its own');
});

test('lean: a leaning zombie stands taller on screen, its feet where they were; the sprites are baked for the lean', () => {
  const v = view(75);
  const top = (lean, head) => {
    const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
    art.sync(v, 2, 0, lean, head);
    const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
    calls.length = 0;
    art.drawZombie(R, common(0, Math.PI / 2, { state: 'idle', vx: 0, vy: 0 }), 1);
    const ys = calls.map((c) => [c.a[6], c.a[6] + c.a[8]]);
    // The feet go first (they are under everything): the bottom of the lower one.
    return { art, top: Math.min(...ys.map((y) => y[0])), feet: Math.max(ys[0][1], ys[1][1]) };
  };
  const upright = top(0, 0);
  const leaning = top(20, 20);
  assert.ok(leaning.top < upright.top - 5, `taller: top ${leaning.top.toFixed(1)} vs ${upright.top.toFixed(1)}`);
  assert.ok(Math.abs(leaning.feet - upright.feet) < 2.5, `it leans about its feet: ${leaning.feet.toFixed(1)} vs ${upright.feet.toFixed(1)}`);
  assert.ok(Math.abs(leaning.art.cam.pb - 55 * DEG) < 1e-9 && Math.abs(leaning.art.cam.ph - 35 * DEG) < 1e-9);
  // Changing the lean bakes again, once it settles, like any camera change.
  const art = leaning.art;
  const cam = art.cam;
  art.sync(v, 2, 1, 30, 20);
  assert.equal(art.cam, cam, 'still moving');
  art.sync(v, 2, 1.4, 30, 20);
  assert.ok(Math.abs(art.cam.pb - 45 * DEG) < 1e-9, 'settled: baked for the new lean');
});

test('overlap: which of two sprites is nearer where they share pixels', () => {
  const sq = (depth) => ({ w: 4, h: 4, ox: 0, oy: 0, rgba: new Uint8ClampedArray(64).fill(255), depth: new Float32Array(16).fill(depth) });
  assert.ok(overlap(sq(5), 0, 0, 0, sq(1), 2, 2, 0) > 0);
  assert.ok(overlap(sq(5), 0, 0, -10, sq(1), 2, 2, 0) < 0, 'the pivots\' depths count');
  assert.equal(overlap(sq(5), 0, 0, 0, sq(1), 10, 10, 0), 0, 'apart: no overlap');
});

/** A view like the game's: aligned streets at 75 degrees, 844 x 390 at the default zoom. */
function view(tilt = 75) {
  const v = new IsoView(0, tilt * DEG);
  v.setViewport(844, 390, 390 / 470);
  v.lookAt(500, 500);
  return v;
}

function common(look, face, extra = {}) {
  const z = new Zombie(500, 500, true);
  z.look = look;
  z.face = face;
  z.alertDelay = 0;
  return Object.assign(z, extra);
}

test('art: a zombie is six sprites, one to one on whole device pixels; in the dark each gets its silhouette over it', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage });
  const v = view();
  assert.equal(art.sync(v, 2, 0), true);
  const ctx = mockCanvas()._ctx || mockCanvas().getContext('2d');
  const R = { ctx, v, t: 1, dpr: 2 };
  calls.length = 0;
  art.drawZombie(R, common(0, 0.3), 1);
  assert.equal(calls.length, 6, 'lit: six parts');
  for (const c of calls) {
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = c.a;
    assert.ok(Math.abs(dw * 2 - sw) < 1e-9 && Math.abs(dh * 2 - sh) < 1e-9, 'one sprite pixel per device pixel');
    assert.ok(Math.abs(dx * 2 - Math.round(dx * 2)) < 1e-9 && Math.abs(dy * 2 - Math.round(dy * 2)) < 1e-9, 'on whole device pixels');
    assert.ok(sx >= 0 && sy >= 0, 'from the atlas');
  }
  calls.length = 0;
  art.drawZombie(R, common(3, 2), 0.4);
  assert.equal(calls.length, 12, 'in the dark: six parts and six silhouettes');
  for (let i = 1; i < 12; i += 2) assert.ok(Math.abs(calls[i].alpha - 0.6) < 1e-9, 'silhouettes at 1 - brightness');
  calls.length = 0;
  art.drawZombie(R, common(5, 4, { hitFlash: 0.05 }), 1);
  assert.equal(calls.length, 12, 'hit: drawn again, lighter');
  assert.ok(calls.slice(6).every((c) => c.op === 'lighter'));
  assert.equal(ctx.globalCompositeOperation, 'source-over', 'state restored');
  assert.equal(ctx.globalAlpha, 1);
  assert.equal(bad, null, bad);
});

test('art: every look draws in every state, at every facing, under every camera', () => {
  for (const tilt of [90, 75, 45, 25]) {
    const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
    const v = view(tilt);
    art.sync(v, 2, 0);
    const R = { ctx: mockCanvas().getContext('2d'), v, t: 3, dpr: 2 };
    for (let look = 0; look < LOOKS.length; look++) {
      for (let k = 0; k < 8; k++) {
        const face = (k / 8) * Math.PI * 2 + 0.05;
        const states = [
          {}, // hunting
          { state: 'idle', vx: 20, vy: 5 },
          { windup: 0.2 },
          { windup: 0.02 },
          { stagger: 0.3 },
        ];
        for (const s of states) {
          calls.length = 0;
          art.drawZombie(R, common(look, face, { vx: 80, vy: 30, anim: k * 0.7, ...s }), 0.7);
          assert.equal(calls.length, 12);
        }
      }
    }
    assert.equal(bad, null, bad);
  }
});

test('art: sprites are baked when first wanted, within a budget; until then a zombie borrows the nearest facing that is ready', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: 0 });
  const v = view();
  art.sync(v, 2, 0);
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
  art.drawZombie(R, common(1, 0), 1);
  const first = art.bakes;
  assert.ok(first >= 4, 'a look\'s first zombie gets its sprites at once (head, torso, foot, the arm pose)');
  // No budget left: another facing is drawn with the one there is, nothing new is baked.
  art.drawZombie(R, common(1, 1.5), 1);
  assert.equal(art.bakes, first);
  // With a budget, warm() gets every look's first facings ready over the coming frames.
  art.budget = 4;
  for (let f = 0; f < 400 && art.warmAt < LOOKS.length * 4; f++) {
    art.sync(v, 2, f / 60);
    art.warm();
  }
  assert.equal(art.warmAt, LOOKS.length * 4, 'warmed');
  const st = art.stats();
  assert.ok(st.bakes > first && st.looks === LOOKS.length && st.pages >= 1);
});

test('art: a new tilt or zoom bakes again once it settles (a slider being dragged doesn\'t bake every frame)', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  const v = view(75);
  art.sync(v, 2, 0);
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
  art.drawZombie(R, common(0, 0), 1);
  const cam = art.cam;
  v.setAngles(0, 60 * DEG);
  assert.equal(art.sync(v, 2, 1), true, 'still drawn, with the sprites there are');
  assert.equal(art.cam, cam);
  calls.length = 0;
  art.drawZombie(R, common(0, 0), 1);
  assert.equal(calls.length, 6, 'scaled while it waits');
  v.setAngles(0, 50 * DEG);
  art.sync(v, 2, 1.2);
  art.sync(v, 2, 1.3);
  assert.equal(art.cam, cam, 'still moving');
  art.sync(v, 2, 1.6);
  assert.notEqual(art.cam, cam, 'settled: baked for the new camera');
  assert.ok(Math.abs(art.cam.pitch - 50 * DEG) < 1e-9);
  assert.equal(art.stats().bakes, 0, 'starting over');
});

test('art: the dead lie as decals of their own look, head where they were thrown', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  const v = view();
  art.sync(v, 2, 0);
  const ctx = mockCanvas().getContext('2d');
  const R = { ctx, v, t: 1, dpr: 2 };
  const s = art.corpse(2);
  assert.ok(s.w > s.h * 0.6, 'lying down: longer than it is wide, give or take the arms');
  calls.length = 0;
  art.drawCorpses(ctx, R, [
    { x: 500, y: 500, r: 11, ang: 0.3, flip: 1, t: 2, look: 2 },
    { x: 540, y: 480, r: 11, ang: 2, flip: -1, t: 49, look: 7 },
  ]);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].alpha < 1, 'an old one fades');
  assert.equal(bad, null, bad);
});

test('settings: the models are on by default and can be switched to the stick figures; their lean and head tilt are sliders', () => {
  assert.equal(DEFAULTS.zombieModels, true);
  const items = SCHEMA.flatMap((g) => g.items || []);
  assert.ok(items.some((i) => i.key === 'zombieModels' && i.type === 'toggle'));
  for (const key of ['zombieLean', 'zombieHeadTilt']) {
    const it = items.find((i) => i.key === key);
    assert.ok(it && it.type === 'range' && it.min === 0 && DEFAULTS[key] > it.min && DEFAULTS[key] <= it.max, key);
  }
});

test('the renderer draws a horde and its dead with the models', async () => {
  const { Game } = await import('../src/game/game.js');
  const { Renderer } = await import('../src/render/renderer.js');
  const { computeLayout } = await import('../src/layout.js');
  const { killZombie } = await import('../src/game/zombies.js');
  const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
  for (const level of ['city', 'interior']) {
    const settings = { ...DEFAULTS, level, playtestPrompt: false, godMode: true };
    const game = new Game(settings, audio, () => {});
    game.setViewport(844, 390);
    const renderer = new Renderer(mockCanvas(1688, 780));
    renderer.resize(844, 390);
    renderer.zart = new ZombieArt({ texture: TEX, makePage: memoryPage });
    const layout = computeLayout(844, 390, { l: 0, r: 0, t: 0, b: 0 }, settings);
    const touch = { pressed: new Map(), move: { active: false }, aim: { active: false }, taps: [], knob: () => ({ x: 0, y: 0 }) };
    const frame = { source: 'mouse', move: { x: 0, y: 0 }, aimActive: false, aimX: 1, aimY: 0, aimRaw: 0, aimScreen: null, fire: false, assist: false, events: [] };
    const input = { source: 'mouse', touch, frame };
    const ui = { layout, fps: 60, frameMs: 16, hintAlpha: 0, input, forceSticks: false, reportRect: null, title: false };
    const p = game.player;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const z = new Zombie(p.x + Math.cos(a) * (60 + (i % 4) * 25), p.y + Math.sin(a) * (60 + (i % 4) * 25), i % 2 === 0);
      game.zombies.push(z);
    }
    for (let f = 0; f < 6; f++) {
      game.update(1 / 60, input.frame);
      if (f === 3) {
        for (const z of game.zombies.slice(-6)) if (z.alive) killZombie(game, z, 1, 0, 200);
      }
      calls.length = 0;
      renderer.render(game, input, ui);
      assert.ok(renderer.R.zart, `${level}: drawn with the models`);
    }
    assert.ok(calls.length > 40, `${level}: sprites drawn (${calls.length})`);
    assert.ok(game.effects.corpses.some((c) => c.look !== undefined), 'the dead keep their look');
    assert.equal(bad, null, bad);
  }
});
