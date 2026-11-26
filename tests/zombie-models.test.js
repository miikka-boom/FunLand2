// The horde's 3D zombie models (assets/zombies/, tools/zombies/build_zombies.py): the parts as
// built from the FBX, the looks, the sprite baker (src/render/zombie-bake.js) and the drawing
// (src/render/zombie-art.js): draw order, darkness, the budget, corpses, and the renderer drawing
// a horde with them on a mock canvas.
// Also blood on them, the ways the dead lie and the shotgun's head pops.
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
        if (k === 'drawImage') calls.push({ alpha: o.globalAlpha, op: o.globalCompositeOperation, a, canvas: o.canvas });
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
const { decodeMesh, Texture, bake, overlap, SHADE } = await import('../src/render/zombie-bake.js');
const { ZombieArt, orderFor, tiltPitches, DIRS, ARM_PITCH, FOOT_L, FOOT_R, TORSO, ARM_L, ARM_R, HEAD, EYES, EYE, FALL_T, DEATHS, pickDeath, wounds, WALK, Composites } = await import('../src/render/zombie-art.js');
const { LOOKS, pickLook } = await import('../src/game/zombie-looks.js');
const { Zombie, damageZombie, POP_BURST, POP_CHANCE } = await import('../src/game/zombies.js');
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

/** The draws this test has made on ctx's canvas (rather than putting composites together). */
const drawsOn = (ctx) => calls.filter((c) => c.canvas === ctx.canvas);

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
    const z = common(0, Math.PI / 2, { state: 'idle', vx: 0, vy: 0 });
    art.drawZombie(R, z, 1);
    const ys = drawsOn(R.ctx).map((c) => [c.a[6], c.a[6] + c.a[8]]);
    // The bottom of the lower foot, where its body has it.
    const P = z._zp;
    const foot = (i) => (Math.round(P.Y[i] * 2 - art._sprite(P, i).oy) + art._sprite(P, i).h) / 2;
    return { art, top: Math.min(...ys.map((y) => y[0])), feet: Math.max(foot(FOOT_L), foot(FOOT_R)) };
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

test('art: a zombie is its body and its head, two sprites one to one on whole device pixels; a swing or a hit, part by part', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage });
  const v = view();
  assert.equal(art.sync(v, 2, 0), true);
  const ctx = mockCanvas().getContext('2d');
  const R = { ctx, v, t: 1, dpr: 2 };
  calls.length = 0;
  art.drawZombie(R, common(0, 0.3, { anim: 1 }), 1);
  let screen = drawsOn(ctx);
  assert.ok(screen.length === 2 || screen.length === 3, `lit: its body and its head (${screen.length})`);
  assert.ok(calls.length > screen.length, 'its body put together first, from its parts');
  for (const c of screen) {
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = c.a;
    assert.ok(Math.abs(dw * 2 - sw) < 1e-9 && Math.abs(dh * 2 - sh) < 1e-9, 'one sprite pixel per device pixel');
    assert.ok(Math.abs(dx * 2 - Math.round(dx * 2)) < 1e-9 && Math.abs(dy * 2 - Math.round(dy * 2)) < 1e-9, 'on whole device pixels');
    assert.ok(sx >= 0 && sy >= 0);
    assert.equal(c.alpha, 1);
  }
  // Another just like it (in step with it), elsewhere: its body is put together already.
  calls.length = 0;
  art.drawZombie(R, common(0, 0.3, { x: 560, y: 470, anim: 1 }), 1);
  assert.equal(calls.length, drawsOn(ctx).length, 'nothing new put together');
  // Partly lit: darkened copies of its body and head, no overlays.
  calls.length = 0;
  art.drawZombie(R, common(3, 2), 0.4);
  screen = drawsOn(ctx);
  assert.ok(screen.length <= 3 && screen.every((c) => c.alpha === 1), 'no overlays');
  // A swing is drawn part by part: six parts, and partly lit, their silhouettes over them.
  calls.length = 0;
  art.drawZombie(R, common(3, 2, { windup: 0.2 }), 0.4);
  screen = drawsOn(ctx);
  assert.equal(screen.length, 12, 'six parts and six silhouettes');
  for (let i = 1; i < 12; i += 2) assert.ok(Math.abs(screen[i].alpha - 0.6) < 1e-9, 'silhouettes at 1 - brightness');
  // A hit flashes it: part by part, drawn again lighter.
  calls.length = 0;
  art.drawZombie(R, common(5, 4, { hitFlash: 0.05 }), 1);
  screen = drawsOn(ctx);
  assert.equal(screen.length, 12, 'hit: drawn again, lighter');
  assert.ok(screen.slice(6).every((c) => c.op === 'lighter'));
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
          const n = drawsOn(R.ctx).length;
          if (s.windup || s.stagger) assert.equal(n, 12, 'part by part, silhouettes over them');
          else assert.ok(n === 2 || n === 3, `body and head (${n})`);
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
  art.drawZombie(R, common(1, 0, { anim: 2 }), 1);
  const first = art.bakes;
  assert.ok(first >= 4, 'a look\'s first zombie gets its sprites at once (head, torso, foot, the arm pose)');
  // No budget left: another facing is drawn with the one there is, nothing new is baked (in step,
  // its arms in the same pose).
  art.drawZombie(R, common(1, 1.5, { anim: 2 }), 1);
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
  assert.ok(drawsOn(R.ctx).length >= 2, 'drawn while it waits');
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


// --- Toon shading, googly eyes, heads with a mind of their own, the night, the dead ----------

/** The test texture with the palette's eye-white swatch white (the rest as testTexture). */
function eyeTexture() {
  const N = 64;
  const px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = (x + 0.5) / N;
      const v = 1 - (y + 0.5) / N;
      const pal = u >= M.PALETTE[0] && u <= M.PALETTE[2] && v >= M.PALETTE[1] && v <= M.PALETTE[3];
      const o = (y * N + x) * 4;
      px[o] = px[o + 1] = px[o + 2] = pal ? (v > 0.94 ? 255 : 0) : 120;
      px[o + 3] = 255;
    }
  }
  return new Texture(N, N, px);
}

test('googly eyes: every head has both eyes and both pupils tagged, the left eye on its left', () => {
  for (const [id, h] of Object.entries(M.HEADS)) {
    const d = decodeMesh(h.mesh);
    assert.ok(d.grp, id);
    const n = [0, 0, 0, 0, 0];
    for (const g of d.grp) n[g]++;
    assert.ok(n[1] > 20 && n[2] > 20 && n[3] > 5 && n[4] > 5, `${id}: ${n}`);
    assert.equal(h.eyes.length, 2);
    assert.ok(h.eyes[0].mid[1] < 0 && h.eyes[1].mid[1] > 0, `${id}: left then right`);
    assert.ok(h.eyes[0].mid[0] > 50, `${id}: the eyes are on the front of the face`);
  }
});

test('baker: the pupils roll inside the whites and the eyes shut (the outline stays)', () => {
  const tex = eyeTexture();
  const head = decodeMesh(M.HEADS.bald.mesh);
  const eyes = M.HEADS.bald.eyes;
  const o = { phi: Math.PI / 2, sp: Math.sin(35 * DEG), cp: Math.cos(35 * DEG), ppu: 0.3, ss: 2 };
  const look = (e) => bake([{ mesh: head, eye: EYES[e], eyes }], tex, o);
  const whites = (s) => {
    let n = 0;
    for (let i = 0; i < s.rgba.length; i += 4) if (s.rgba[i + 3] > 200 && s.rgba[i] > 220) n++;
    return n;
  };
  const ahead = look(EYE.ahead);
  const right = look(EYE.right);
  const shut = look(EYE.shut);
  let moved = 0;
  for (let i = 0; i < ahead.rgba.length; i += 4) if (Math.abs(ahead.rgba[i] - right.rgba[i]) > 100) moved++;
  assert.ok(moved > 30, `the pupils moved (${moved} px)`);
  assert.equal(ahead.w, right.w, 'inside the whites: the head is the same size');
  assert.ok(whites(shut) < whites(ahead) * 0.5, `shut: ${whites(shut)} white px, open: ${whites(ahead)}`);
  const alpha = (s) => s.rgba.reduce((n, x, i) => n + (i % 4 === 3 && x > 128 ? 1 : 0), 0);
  assert.ok(Math.abs(alpha(shut) - alpha(ahead)) < alpha(ahead) * 0.02, 'the silhouette is the same (it is shared)');
});

test('baker: toon shading puts the skin in two bands of light, with a rim of light at the edges', () => {
  const arm = decodeMesh(M.BODIES.normal.arm);
  const s = bake([{ mesh: arm }], TEX, { phi: 0.6, sp: Math.sin(55 * DEG), cp: Math.cos(55 * DEG), ppu: 0.3, ss: 2 });
  // Skin pixels (the test texture's skin is 200 grey): the shadow band, the lit band, or a rimmed edge.
  const dark = 200 * SHADE.dark;
  const lit = Math.min(255, 200 * SHADE.lit);
  let skin = 0;
  let banded = 0;
  for (let i = 0; i < s.rgba.length; i += 4) {
    if (s.rgba[i + 3] < 250 || s.rgba[i] < 90 || s.rim[i / 4] > 10) continue;
    skin++;
    if (Math.abs(s.rgba[i] - dark) < 12 || Math.abs(s.rgba[i] - lit) < 12) banded++;
  }
  assert.ok(skin > 100 && banded / skin > 0.7, `${banded} of ${skin} skin px in the two bands`);
  assert.ok(Math.max(...s.rim) > 60, 'a rim of light at the edges');
});

test('art: at night a zombie where no light reaches is put together from the darkened copies; partly lit, darkened to a level; never overlays', () => {
  const v = view();
  const night = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  night.sync(v, 2, 0, 0, 0, 0.4);
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
  calls.length = 0;
  const z = common(0, 1);
  night.drawZombie(R, z, 0.4);
  let screen = drawsOn(R.ctx);
  assert.ok(screen.length === 2 || screen.length === 3);
  assert.ok(screen.every((c) => c.alpha === 1), 'no overlays');
  const torso = night._sprite(z._zp, TORSO);
  assert.ok(calls.some((c) => c.a[0] === torso.dk.canvas && c.a[1] === torso.dk.x && c.a[2] === torso.dk.y), 'from the darkened copies (with their moonlit rim)');
  const head = night._sprite(z._zp, HEAD);
  assert.ok(screen.some((c) => c.a[1] === head.dk.x && c.a[2] === head.dk.y), 'its head too');
  calls.length = 0;
  night.drawZombie(R, common(0, 1), 0.7);
  screen = drawsOn(R.ctx);
  assert.ok(screen.length <= 3 && screen.every((c) => c.alpha === 1), 'part lit (the flashlight\'s edge): darkened to a level');
  const day = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  day.sync(v, 2, 0, 0, 0, 1);
  calls.length = 0;
  day.drawZombie(R, common(0, 1), 0.4);
  screen = drawsOn(R.ctx);
  assert.ok(screen.length <= 3 && screen.every((c) => c.alpha === 1), 'by day, in a shadow: likewise');
  assert.equal(bad, null, bad);
});

test('art: a hunter\'s head turns to what it is after before its body does; a shambler\'s glances about, eyes drooping', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  const v = view();
  art.sync(v, 2, 0);
  const z = common(0, 0, { x: 500, y: 500 });
  const out = [0, 0];
  const R = (px, py) => ({ v, t: 1, dpr: 2, game: { player: { x: px, y: py, alive: true }, ally: null } });
  art._gaze(R(500, 700), z, 0, true, false, 1, out); // you, off to its right (y is down the map)
  assert.ok(out[0] > 0.5, `turns right: ${out[0]}`);
  assert.ok(out[1] === EYE.right || out[1] === EYE.shut, 'and looks the rest of the way');
  art._gaze(R(500, 300), z, 0, true, false, 1, out);
  assert.ok(out[0] < -0.5, `turns left: ${out[0]}`);
  art._gaze(R(700, 500), z, 0, true, false, 1, out);
  assert.ok(Math.abs(out[0]) < 0.05, 'straight ahead');
  const idle = common(0, 0, { state: 'idle' });
  const turns = new Set();
  for (let t = 0; t < 30; t += 0.25) {
    idle.anim = t;
    art._gaze(R(900, 900), idle, 0, false, false, t, out);
    turns.add(out[0].toFixed(3));
    assert.ok(out[1] === EYE.down || out[1] === EYE.shut);
  }
  assert.ok(turns.size >= 3 && turns.size <= 5, `a few held glances: ${[...turns]}`);
  art._gaze(R(900, 900), common(0, 0, { stagger: 0.4 }), 0, false, true, 1, out);
  assert.ok(out[1] === EYE.up || out[1] === EYE.crossed, 'hit: eyes rolled');
});

test('death: one big blow can take a head off; it flies, bounces and lies still. Two SMG hits never do', async () => {
  const { Game } = await import('../src/game/game.js');
  const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
  const game = new Game({ ...DEFAULTS, playtestPrompt: false, godMode: true }, audio, () => {});
  const p = game.player;
  const random = Math.random;
  try {
    Math.random = () => 0.1;
    const big = new Zombie(p.x + 60, p.y, true);
    game.zombies.push(big);
    damageZombie(game, big, 95, 1, 0, 120, 0.5);
    const c = game.effects.corpses.at(-1);
    assert.ok(!big.alive && c.head, 'a hunting rifle round: off it comes');
    const x0 = c.head.x;
    for (let i = 0; i < 240 && !c.head.rest; i++) game.effects.update(1 / 60, game.world);
    assert.ok(c.head.rest && c.head.z === 0, 'it comes to rest on the ground');
    assert.ok(c.head.x > x0 + 20, 'the way the blow went');
    const small = new Zombie(p.x - 60, p.y, true);
    game.zombies.push(small);
    damageZombie(game, small, 26, -1, 0, 55, 0.3);
    game.time += 0.1;
    damageZombie(game, small, 26, -1, 0, 55, 0.3);
    assert.ok(!small.alive && !game.effects.corpses.at(-1).head, `${26} < ${POP_BURST}: it keeps its head`);
  } finally {
    Math.random = random;
  }
});

test('death: the dead go over before they lie down; a few a frame may be baked past the budget, the rest drop at once', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: 0 });
  const v = view();
  art.sync(v, 2, 0);
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
  const dead = [0, 1, 2].map((i) => ({ x: 500 + i * 40, y: 500, r: 11, ang: 0.4 * i, flip: 1, t: 0, look: i }));
  const started = dead.map((c) => art.startFall(c));
  assert.deepEqual(started, [true, true, false], 'two past the budget, the third straight to the ground');
  for (const c of dead.slice(0, 2)) {
    const off = Math.atan2(Math.sin(c.angQ - c.ang), Math.cos(c.angQ - c.ang));
    assert.ok(Math.abs(off) <= Math.PI / 16 + 1e-9, `it lies within half a fall facing of the way it was thrown (${off.toFixed(3)})`);
    for (const t of [0.01, FALL_T * 0.5, FALL_T * 0.9]) {
      c.t = t;
      calls.length = 0;
      art.drawFalling(R, c, 1);
      assert.equal(calls.length, 1, `falling, t = ${t}`);
    }
  }
  // On the ground: the body, and a knocked-off head where it came to rest.
  const headless = { x: 600, y: 520, r: 11, ang: 1, flip: 1, t: 5, look: 4, head: { x: 640, y: 540, z: 0, rot: 2, rest: true } };
  calls.length = 0;
  art.drawCorpses(R.ctx, R, [dead[2], headless]);
  assert.equal(calls.length, 3, 'two bodies and a head');
  assert.notEqual(art.corpse(4, true), art.corpse(4), 'a headless body is its own decal');
  assert.equal(bad, null, bad);
});


// --- Blood, the ways the dead lie, the shotgun ----------------------------------------------

/** Pixels of a baked sprite that are blood red (the test texture is grey). */
function redPx(s) {
  let n = 0;
  for (let i = 0; i < s.rgba.length; i += 4) if (s.rgba[i + 3] > 200 && s.rgba[i] > s.rgba[i + 1] + 40) n++;
  return n;
}

test('baker: blood goes where its splats are, on skin and clothes, never on the outlines; a roll tips the body onto its side', () => {
  const torso = decodeMesh(M.BODIES.normal.torso);
  const o = { phi: Math.PI / 2, sp: Math.sin(20 * DEG), cp: Math.cos(20 * DEG), ppu: 0.3, ss: 2 };
  const clean = bake([{ mesh: torso }], TEX, o);
  const wounded = bake([{ mesh: torso, blood: wounds(M.BODIES.normal.torso, 0) }], TEX, o);
  const far = bake([{ mesh: torso, blood: [[0, 0, 900, 30]] }], TEX, o);
  assert.equal(redPx(clean), 0);
  assert.ok(redPx(wounded) > 60, `a bloodied belly, seen from the front (${redPx(wounded)} px)`);
  assert.deepEqual(far.rgba, clean.rgba, 'a splat that reaches nothing paints nothing');
  // Soaked through, it keeps its black outline and its silhouette (which it shares).
  const soaked = bake([{ mesh: torso, blood: [[0, 0, 110, 400]] }], TEX, o);
  const black = (s) => {
    let n = 0;
    for (let i = 0; i < s.rgba.length; i += 4) if (s.rgba[i + 3] > 200 && s.rgba[i] < 20) n++;
    return n;
  };
  assert.ok(redPx(soaked) > redPx(wounded) * 3);
  assert.ok(Math.abs(black(soaked) - black(clean)) <= black(clean) * 0.03, `the outline stays black (${black(soaked)} vs ${black(clean)})`);
  for (let i = 3; i < clean.rgba.length; i += 4) assert.equal(soaked.rgba[i], clean.rgba[i], 'the same silhouette');
  // Rolled onto its left side and seen from above, it lies off to its left of its feet (-y here);
  // onto its right side, to its right.
  const top = { phi: 0, sp: 1, cp: 0, ppu: 0.3, ss: 1 };
  const left = bake([{ mesh: torso }], TEX, { ...top, roll: Math.PI / 2 });
  const right = bake([{ mesh: torso }], TEX, { ...top, roll: -Math.PI / 2 });
  assert.ok(left.oy > left.h * 0.8, `onto its left: its feet at ${left.oy} of ${left.h} px`);
  assert.ok(right.oy < right.h * 0.2, `onto its right: its feet at ${right.oy} of ${right.h} px`);
});

test('art: a zombie that has bled wears a bloodied shirt, its torso\'s second sprite (same silhouette); a shove doesn\'t show', async () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  const v = view();
  art.sync(v, 2, 0);
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
  const L = art.look(1);
  const z = common(1, Math.PI / 2); // facing 8 (the view has no yaw)
  const drawn = (e) => calls.some((c) => c.a[0] === e.canvas && c.a[1] === e.x && c.a[2] === e.y);
  calls.length = 0;
  art.drawZombie(R, z, 1);
  const clean = L.torso.s[8 * L.torso.n];
  assert.ok(clean && drawn(clean), 'clean');
  assert.equal(L.torso.s[8 * L.torso.n + 1], undefined, 'no bloodied shirt baked for it');
  z.bloodied = true;
  // Within a frame or two (one zombie's new sprites a frame).
  calls.length = 0;
  for (let f = 1; f <= 3; f++) {
    art.sync(v, 2, f / 60);
    art.drawZombie(R, z, 1);
  }
  const bloody = L.torso.s[8 * L.torso.n + 1];
  assert.ok(bloody && drawn(bloody) && !drawn(clean), 'bloodied (its body put together again with it)');
  assert.equal(z._zp.tw, 1);
  assert.equal(bloody.k, clean.k, 'one silhouette for both');
  // Wounds sit low (below the big head, where they show), on one side or the other by colour.
  const box = M.BODIES.normal.torso.box;
  for (const [a, c, h] of wounds(M.BODIES.normal.torso, 0)) assert.ok(h < box[2] + (box[5] - box[2]) * 0.55, `low: ${a}, ${c}, ${h}`);
  assert.ok(wounds(M.BODIES.normal.torso, 0, true)[0][1] === -wounds(M.BODIES.normal.torso, 0)[0][1], 'mirrored');
  // In the game: a bullet bleeds it, a shove doesn't.
  const { Game } = await import('../src/game/game.js');
  const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
  const game = new Game({ ...DEFAULTS, playtestPrompt: false, godMode: true }, audio, () => {});
  const shoved = new Zombie(game.player.x + 40, game.player.y, true);
  damageZombie(game, shoved, 8, 1, 0, 340, 0.8, false);
  assert.ok(shoved.alive && !shoved.bloodied, 'shoved');
  damageZombie(game, shoved, 17, 1, 0, 75, 0.2);
  assert.ok(shoved.alive && shoved.bloodied, 'shot');
  assert.equal(bad, null, bad);
});

test('death poses: eight ways to lie, picked by weight, each its own bloodied decal, head toward -x and feet at the spot', () => {
  assert.equal(DEATHS.length, 8);
  const seen = new Set();
  for (let r = 0; r < 1; r += 0.002) seen.add(pickDeath(r));
  assert.equal(seen.size, DEATHS.length, 'every pose turns up');
  assert.equal(pickDeath(0), 0);
  assert.equal(pickDeath(0.9999), DEATHS.length - 1);
  assert.ok(DEATHS.some((d) => d.lie > 0) && DEATHS.some((d) => d.lie < 0) && DEATHS.some((d) => d.roll > 0) && DEATHS.some((d) => d.roll < 0), 'on its back, on its face, on either side');
  for (const d of DEATHS) {
    assert.ok(d.arms.every(([, pitch]) => pitch > -0.5), `${d.name}: the long arms never go down by its sides`);
    assert.ok(EYE[d.eye] !== undefined, `${d.name}: its eyes`);
  }
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  art.sync(view(), 2, 0);
  const decals = DEATHS.map((_, p) => art.corpse(0, false, p));
  assert.equal(new Set(decals).size, DEATHS.length, 'a decal for each');
  assert.equal(art.corpse(0, false, 3), decals[3], 'baked once');
  assert.ok(new Set(decals.map((e) => `${e.w}x${e.h}`)).size >= 5, 'shaped differently');
  for (const e of decals) assert.ok(e.cx > e.w * 0.9, 'its head toward -x, its feet at the spot');
  // The dead are bloodied all over, and where the head was when it came off.
  const L = art.look(0);
  const whole = art._lying(L, 0, 1, false, EYES[EYE.up]);
  const headless = art._lying(L, 0, 1, true, EYES[EYE.up]);
  assert.equal(whole.length, 6);
  assert.equal(headless.length, 5);
  assert.ok(whole[2].blood.length > wounds(L.body.torso, 0).length, 'more blood than on the wounded');
  assert.ok(headless[2].blood.length > whole[2].blood.length, 'and the neck');
  const top = { phi: 0, sp: 1, cp: 0, ppu: 0.3, ss: 1, lie: Math.PI / 2 };
  assert.ok(redPx(bake(headless, TEX, top)) > redPx(bake(whole, TEX, top)), 'the stump shows');
});

test('death: it goes over the way its pose has it, head where it was thrown; once down it holds its last frame until its decal is baked', () => {
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  const v = view();
  art.sync(v, 2, 0);
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
  for (let p = 0; p < DEATHS.length; p++) {
    const c = { x: 500, y: 500, r: 11, ang: 0.7 + p, t: 0, look: 3, poseI: p };
    assert.equal(art.falling(c), true, DEATHS[p].name);
    const facing = (c.fallDir * 2 * Math.PI) / 16; // the view has no yaw
    assert.ok(Math.abs(wrap(c.angQ + DEATHS[p].face - facing)) < 1e-9, `${DEATHS[p].name}: the decal lies as it fell`);
    assert.ok(Math.abs(wrap(c.angQ - c.ang)) <= Math.PI / 16 + 1e-9, `${DEATHS[p].name}: head the way it was thrown`);
    c.t = FALL_T + 0.01;
    assert.equal(art.falling(c), true, 'down, its decal not baked yet: it holds its last frame');
    calls.length = 0;
    art.drawFalling(R, c, 1);
    assert.equal(calls.length, 1);
    assert.equal(art.falling(c, true), false, 'its decal baked as soon as there\'s time, before the ground is drawn: on the ground');
  }
  // With no time to spare, it waits a moment at most.
  const slow = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: 0 });
  slow.sync(v, 2, 0);
  const c = { x: 500, y: 500, r: 11, ang: 0, t: 0, look: 5, poseI: 3 };
  assert.equal(slow.falling(c), true, 'past the budget: one of the first two a frame');
  c.t = FALL_T + 0.01;
  slow.drawFalling(R, c, 1);
  assert.equal(slow.falling(c, true), true);
  c.t = FALL_T + 0.3;
  assert.equal(slow.falling(c), false, 'on the ground anyway');
  // A body that drops straight to the ground lies as its look's dead already do, if any do.
  const busy = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: 0 });
  busy.sync(v, 2, 0);
  busy.corpse(6, false, 4);
  busy.fallStarts = 2;
  const d = { x: 500, y: 500, r: 11, ang: 0, t: 0, look: 6, poseI: 1 };
  assert.equal(busy.falling(d), false);
  assert.equal(d.poseI, 4, 'the pose that was ready');
  assert.equal(bad, null, bad);
});

test('the shotgun takes a head off one kill in five; a hunting rifle round, four in five', async () => {
  const { Game } = await import('../src/game/game.js');
  const { hitscan } = await import('../src/game/player.js');
  const { WEAPONS } = await import('../src/game/weapons.js');
  const shotgun = WEAPONS.find((w) => w.id === 'shotgun');
  const hunting = WEAPONS.find((w) => w.id === 'hunting');
  assert.equal(shotgun.pop, 0.2);
  assert.equal(hunting.pop, undefined, 'the rest go by the default');
  assert.equal(POP_CHANCE, 0.8);
  const audio = new Proxy({ listener: { x: 0, y: 0 } }, { get: (o, k) => (k in o ? o[k] : () => {}) });
  const kill = (def, roll) => {
    const game = new Game({ ...DEFAULTS, playtestPrompt: false, godMode: true }, audio, () => {});
    const p = game.player;
    game.zombies.length = 0;
    const z = new Zombie(p.x + 30, p.y, true);
    game.zombies.push(z);
    const random = Math.random;
    try {
      Math.random = () => roll;
      for (let i = 0; i < def.pellets; i++) hitscan(game, p, p.x, p.y, 0, def);
    } finally {
      Math.random = random;
    }
    assert.ok(!z.alive, `${def.id}: dead`);
    return !!game.effects.corpses.at(-1).head;
  };
  assert.equal(kill(shotgun, 0.5), false, 'a blast: whole, mostly');
  assert.equal(kill(shotgun, 0.1), true, 'one in five');
  assert.equal(kill(hunting, 0.5), true, 'a rifle round: off it comes');
  assert.equal(kill(hunting, 0.9), false);
});

test('death: fall frames stay out of the atlas (each on a canvas of its own), and only the last few dozen are kept', () => {
  const sizes = [];
  const art = new ZombieArt({ texture: TEX, makePage: (w, h) => (sizes.push([w, h]), memoryPage()), budget: Infinity });
  art.sync(view(), 2, 0, 0, 0, 0.4); // at night: with their darkened copies beside them
  const L = art.look(2);
  for (let i = 0; i < 150; i++) art._fallSprite(L, i % 8, (i >> 3) % 16, i % 3, false, true);
  assert.equal(art.atlas.pages.length + art.deadAtlas.pages.length, 0, 'not in the atlas');
  assert.equal(sizes.length, 150);
  assert.ok(sizes.every(([w, h]) => w < 1024 && h < 1024), 'small canvases');
  assert.equal(L.fall.size, 96, 'the newest kept');
  assert.equal(art.stats().falls, 96);
  const s = L.fall.get(`${149 % 8} ${(149 >> 3) % 16} ${149 % 3} 0`);
  assert.ok(s && s.k.canvas === s.canvas && s.dk.canvas === s.canvas && s.k.x === s.w + 1 && s.dk.x === 2 * s.w + 2, 'its silhouette and night copy beside it');
  assert.equal(L.fall.get('0 0 0 0'), undefined, 'the oldest let go');
});


// --- Composites: a zombie's body put together into one sprite -----------------------------

test('composites: a walking body is put together once for each frame of its walk, and shared by every zombie that looks, faces and steps the same', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  const v = view();
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
  const z = common(2, 1.2, { vx: 60, vy: 40 });
  const frames = new Set();
  const bodies = new Set();
  for (let i = 0; i < 80; i++) {
    z.anim = i * 0.011; // a little over a stride of a hunter's
    art.sync(v, 2, i / 60);
    art.drawZombie(R, z, 1);
    frames.add(z._zp.q);
    bodies.add(z._zp.back);
  }
  assert.equal(frames.size, WALK, `the walk in ${WALK} frames`);
  assert.equal(bodies.size, WALK, 'a body put together for each');
  // Another zombie of the same look, facing the same way, in step: the same composite.
  const twin = common(2, 1.2, { vx: 60, vy: 40, x: 620, y: 430, anim: z.anim });
  art.drawZombie(R, twin, 1);
  assert.equal(twin._zp.back, z._zp.back, 'shared');
  // A shambler standing still: one body, whatever the time.
  const still = common(2, 1.2, { vx: 0, vy: 0, state: 'idle' });
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    still.anim = i * 0.1;
    art.sync(v, 2, 2 + i / 60);
    art.drawZombie(R, still, 1);
    seen.add(still._zp.back);
  }
  assert.equal(seen.size, 1, 'standing: no walk');
  assert.equal(bad, null, bad);
});

test('composites: prepared before anything is drawn, so drawing the horde neither bakes nor puts anything together', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity, composeBudget: Infinity });
  const v = view();
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2, game: null };
  const zs = [];
  for (let i = 0; i < 24; i++) zs.push(common(i % LOOKS.length, i * 0.7, { x: 400 + (i % 6) * 30, y: 420 + Math.floor(i / 6) * 40, vx: i % 3 ? 50 : 0, vy: 20, anim: i * 0.3 }));
  for (let f = 0; f < 3; f++) {
    art.sync(v, 2, f / 60, 0, 0, 0.4);
    for (const [i, z] of zs.entries()) art.prepare(R, z, i % 4 ? 0.4 : 0.75); // most where no light reaches, some partly lit
    art.ready(R);
    const bakes = art.bakes;
    const built = art.comp.built;
    calls.length = 0;
    for (const [i, z] of zs.entries()) art.drawZombie(R, z, i % 4 ? 0.4 : 0.75);
    assert.equal(art.bakes, bakes, 'nothing baked while drawing');
    assert.equal(art.comp.built, built, 'nothing put together while drawing');
    assert.equal(calls.length, drawsOn(R.ctx).length, 'every draw on the screen');
    assert.ok(calls.every((c) => c.alpha === 1), 'no overlays');
    assert.ok(calls.length <= zs.length * 3, `two or three a zombie (${calls.length} for ${zs.length})`);
  }
  assert.ok(art.stats().comps > 0);
  assert.equal(bad, null, bad);
});

test('composites: kept in a few pages; when they are full the oldest is cleared for new ones and what was on it is let go', () => {
  const made = [];
  const cache = new Composites((w, h) => {
    const c = mockCanvas(w, h);
    made.push(c);
    return c;
  }, 2, 64);
  const keys = [];
  for (let i = 0; i < 9; i++) {
    const e = cache.add(`k${i}`, 30, 30);
    assert.ok(e && e.x + 30 <= 64 && e.y + 30 <= 64, 'on its page');
    keys.push(`k${i}`);
  }
  assert.equal(made.length, 2, 'two pages, used again');
  assert.equal(cache.get('k0'), null, 'the oldest page was cleared');
  assert.ok(cache.get('k8'), 'the newest is there');
  assert.ok(cache.get('k4') && cache.get('k7'), 'and the page before it');
  assert.equal(cache.add('big', 65, 10), null, 'too big for a page');
  cache.clear();
  assert.equal(cache.get('k8'), null);
  assert.equal(cache.px, 0);
});


test('a hunter\'s arms wave as it comes at you, one up as the other comes down, with its stride (and standing still); a shambler\'s hang', () => {
  const art = new ZombieArt({ texture: TEX, makePage: memoryPage, budget: Infinity });
  const v = view();
  const R = { ctx: mockCanvas().getContext('2d'), v, t: 1, dpr: 2 };
  const arms = (z) => {
    const pairs = new Set();
    const bodies = new Set();
    for (let i = 0; i < 80; i++) {
      z.anim = i * 0.011; // a stride and a little
      art.sync(v, 2, z.anim);
      art.drawZombie(R, z, 1);
      const P = z._zp;
      assert.equal(P.iL + P.iR, 4, 'one up as the other comes down');
      pairs.add(`${P.iL}${P.iR}`);
      bodies.add(P.back);
    }
    return { pairs, bodies };
  };
  const running = arms(common(4, 0.8, { vx: 70, vy: 30 }));
  assert.deepEqual([...running.pairs].sort(), ['13', '22', '31'], 'low, reaching and raised, each arm in turn');
  assert.equal(running.bodies.size, WALK, 'still a body for each frame of its stride');
  const standing = arms(common(4, 0.8, { vx: 0, vy: 0 }));
  assert.deepEqual([...standing.pairs].sort(), ['13', '22', '31'], 'standing, it still waves');
  // A shambler's arms hang low, both the same.
  const shambler = common(4, 0.8, { vx: 20, vy: 5, state: 'idle' });
  for (let i = 0; i < 40; i++) {
    shambler.anim = i * 0.04;
    art.sync(v, 2, 3 + i / 60);
    art.drawZombie(R, shambler, 1);
    assert.ok(shambler._zp.iL === 1 && shambler._zp.iR === 1);
  }
  assert.equal(bad, null, bad);
});
