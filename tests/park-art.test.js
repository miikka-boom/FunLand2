// The streets' lamps and the parks' furniture as final art: lamp posts, benches and fountains as
// baked 3D models leaning toward the camera (src/render/prop-art.js; made with Scenario and
// tools/props/build_props.py), trees drawn standing up from a sprite sheet (assets/streets/trees.js),
// the parks' iron railings and grass; and what standing up asks of the scene: fading a crown
// over the survivor, outlines of what is behind it (scene3d.js billHides), round shadows.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const { PROPS, PropArt, propPitch, propSize } = await import('../src/render/prop-art.js');
const { decodeMesh, Texture, bake } = await import('../src/render/zombie-bake.js');
const { modelFor, standScale } = await import('../src/render/models.js');
const { billHides } = await import('../src/render/scene3d.js');
const { groundEllipse } = await import('../src/render/prims.js');
const { TEXTURE_SPAN } = await import('../src/render/textures.js');
const { BARE_TREES, PARK_TREES, TREES_IMAGE } = await import('../assets/streets/trees.js');
const { IsoView } = await import('../src/iso.js');
const { generateCity } = await import('../src/world/map-gen.js');
const { addWorldFeatures } = await import('../src/world/features-gen.js');
const { addScavenging } = await import('../src/world/scavenge-gen.js');
const { furnishStreets } = await import('../src/world/street-furniture.js');

const DEG = Math.PI / 180;
const view = (pitchDeg = 75, yaw = 0) => {
  const v = new IsoView(yaw, pitchDeg * DEG);
  v.setViewport(844, 390, 390 / 470);
  v.lookAt(500, 500);
  return v;
};

test('the lamp post, the bench and the fountain: whole meshes their size, standing on the ground, textures beside them', () => {
  for (const name of ['lamp', 'bench', 'fountain']) {
    const p = PROPS[name];
    const m = decodeMesh(p.mesh);
    for (const i of m.tri) assert.ok(i < m.n, name);
    assert.ok(p.mesh.box[0][2] >= 0, `${name} stands on the ground`);
    assert.equal(fs.readFileSync(new URL(`../${p.texture}`, import.meta.url)).toString('ascii', 8, 12), 'WEBP', name);
  }
  const tall = (name) => (PROPS[name].mesh.box[1][2] - PROPS[name].mesh.box[0][2]) / 10;
  // A lamp: as tall as the old post (96), stood on its pole's foot, its arm and lantern out in front.
  const [lo, hi] = PROPS.lamp.mesh.box;
  assert.ok(tall('lamp') > 92 && tall('lamp') < 100, `lamp ${tall('lamp')} tall`);
  assert.ok(-lo[0] < 120 && hi[0] > 200, 'the pole at the origin, the arm reaching forward');
  const L = PROPS.lamp.light;
  assert.ok(L[0] > 150 && L[0] < hi[0] && L[2] > 500 && L[2] < hi[2], 'its lantern out on the arm, up high');
  // A bench: about as long as its footprint (52), knee high; a fountain's centre piece.
  const [, benchLen] = propSize('bench');
  assert.ok(benchLen > 48 && benchLen < 54 && tall('bench') > 22 && tall('bench') < 34, `bench ${benchLen} long, ${tall('bench')} tall`);
  assert.ok(tall('fountain') > 50 && tall('fountain') < 62 && propSize('fountain')[1] > 30, 'fountain centre piece');
});

test('props lean toward a steep camera as the zombies do: a lamp 15 degrees, a fountain 22; not past a low one; a car not at all', () => {
  assert.ok(Math.abs(propPitch('lamp', 75 * DEG) - 60 * DEG) < 1e-9);
  assert.ok(Math.abs(propPitch('fountain', 75 * DEG) - 53 * DEG) < 1e-9);
  assert.ok(Math.abs(propPitch('bench', 75 * DEG) - 63 * DEG) < 1e-9);
  assert.equal(propPitch('car', 75 * DEG), 75 * DEG);
  assert.ok(Math.abs(propPitch('lamp', 40 * DEG) - 35 * DEG) < 1e-9, 'stops at 35 degrees');
  assert.equal(propPitch('lamp', 25 * DEG), 25 * DEG, 'a low camera already sees its side');
  // So a lamp's sprite shows more of its height than the camera alone would.
  const w = 8;
  const data = new Uint8ClampedArray(w * w * 4).fill(200);
  const m = decodeMesh(PROPS.lamp.mesh);
  const flat = bake([{ mesh: m }], new Texture(w, w, data), { phi: 0, sp: Math.sin(75 * DEG), cp: Math.cos(75 * DEG), ppu: 0.2, ss: 1 });
  const lean = bake([{ mesh: m }], new Texture(w, w, data), { phi: 0, sp: Math.sin(60 * DEG), cp: Math.cos(60 * DEG), ppu: 0.2, ss: 1 });
  assert.ok(lean.h > flat.h * 1.3, `${lean.h} px tall leaning, ${flat.h} not`);
});

test('a prop drawn at a point, turned, tilted; and where a point of it lands on screen (a lamp\'s lantern)', async () => {
  const drawn = [];
  const fakeCanvas = () => {
    const c = { width: 0, height: 0 };
    c.getContext = () => ({ canvas: c, globalCompositeOperation: 'source-over', setTransform() {}, createImageData: (cw, ch) => ({ data: new Uint8ClampedArray(cw * ch * 4) }), putImageData() {}, fillRect() {}, drawImage: (src, x, y) => drawn.push({ to: c, src, x, y }) });
    return c;
  };
  const w = 8;
  const data = new Uint8ClampedArray(w * w * 4).fill(180);
  const art = new PropArt({ makeCanvas: fakeCanvas, loadPixels: async () => ({ w, h: w, data }), budget: Infinity });
  const v = view();
  const screen = fakeCanvas();
  const R = { ctx: screen.getContext(), v, dpr: 2, reset() {} };
  art.begin(v, 2, null);
  assert.equal(art.drawAt(R, 'lamp', 500, 500, 0, 0, 1), false, 'not until its texture is in');
  await new Promise((r) => setTimeout(r, 0));
  art.begin(v, 2, null);
  assert.equal(art.drawAt(R, 'lamp', 500, 500, 0, 0, 1), true);
  const d = drawn.filter((x) => x.to === screen);
  assert.ok(d.length === 1 && Number.isInteger(d[0].x) && Number.isInteger(d[0].y), 'one draw, on whole pixels');
  // Its four headings: four sprites; a bench set at a slant: one more.
  for (const h of [Math.PI / 2, Math.PI, -Math.PI / 2]) art.drawAt(R, 'lamp', 500, 500, 0, h, 1);
  assert.equal(art.sprites.size, 4);
  const bench = { x: 480, y: 480, w: 52, h: 16 };
  assert.equal(art.drawProp(R, 'bench', bench, 1, Math.PI / 2, null, 0.4), true);
  assert.equal(art.sprites.size, 5);
  // The lantern, its arm pointing screen right: right of the post and up the screen; pointing
  // at the camera: in front of the post, still up.
  const out = [0, 0];
  art.offsetOf(v, 'lamp', 0, 1, PROPS.lamp.light, out);
  assert.ok(out[0] > 15 * v.scale && out[1] < -20 * v.scale, `right and up: ${out}`);
  // Leaning shows it higher up than the camera alone would put it.
  const k = 0.1 * v.scale;
  assert.ok(-out[1] > PROPS.lamp.light[2] * k * Math.cos(75 * DEG) * 1.5, 'higher than without the lean');
  art.offsetOf(v, 'lamp', Math.PI / 2, 1, PROPS.lamp.light, out);
  assert.ok(Math.abs(out[0]) < 1e-6 && out[1] < 0, `toward the camera: ${out}`);
});

test('trees stand up: the sheet\'s sprites inside the atlas, their trunks\' feet, their heights; shorter from a steeper camera', () => {
  const webp = fs.readFileSync(new URL(`../${TREES_IMAGE}`, import.meta.url));
  assert.equal(webp.toString('ascii', 8, 12), 'WEBP');
  const W = 1 + webp.readUIntLE(24, 3);
  const H = 1 + webp.readUIntLE(27, 3);
  assert.equal(Object.keys(BARE_TREES).length, 6);
  assert.deepEqual(Object.keys(PARK_TREES).sort(), ['autumn', 'elm', 'linden', 'maple', 'oak', 'pine']);
  for (const [k, q] of Object.entries({ ...BARE_TREES, ...PARK_TREES })) {
    assert.ok(q.x >= 0 && q.y >= 0 && q.x + q.w <= W && q.y + q.h <= H, `${k} inside the ${W}x${H} atlas`);
    assert.ok(q.ax > q.w * 0.2 && q.ax < q.w * 0.8, `${k}: its trunk's foot`);
  }
  for (const q of Object.values(BARE_TREES)) assert.ok(q.height >= 55 && q.height <= 75);
  for (const q of Object.values(PARK_TREES)) assert.ok(q.height >= 80 && q.height <= 100);
  assert.ok(standScale(view(25)) > 0.95 && standScale(view(45)) === 1);
  const s75 = standScale(view(75));
  assert.ok(s75 > 0.85 && s75 < 0.95, `${s75}`);
  assert.equal(standScale({ flat: true }), 0.72);
});

test('a crown hides what is behind it on screen (fading it over the survivor, outlining zombies), never what is in front', () => {
  const v = view();
  const tree = { x: 492, y: 492, w: 16, h: 16 };
  const bill = { w: 60, h: 80, z: 0, crown: 0.72 };
  // Just behind the trunk, at head height: under the crown.
  assert.ok(billHides(v, tree, bill, 500, 470, 24));
  // In front of it: never.
  assert.ok(!billHides(v, tree, bill, 500, 530, 24));
  // Far to the side, or so far behind its top is below: no.
  assert.ok(!billHides(v, tree, bill, 560, 470, 24));
  assert.ok(!billHides(v, tree, bill, 500, 300, 24));
  // Behind the bare trunk, below the crown: no.
  assert.ok(!billHides(v, tree, bill, 500, 499, 0));
  assert.ok(!billHides({ ...v, flat: true }, tree, bill, 500, 470, 24), 'not from straight above');
});

test('round shadows lie on the ground: sixteen points round the ellipse, turned', () => {
  const v = view();
  const pts = [];
  let closed = false;
  const ctx = { moveTo: (x, y) => pts.push([x, y]), lineTo: (x, y) => pts.push([x, y]), closePath: () => (closed = true) };
  groundEllipse(ctx, v, 500, 500, 20, 8, Math.PI / 2);
  assert.equal(pts.length, 16);
  assert.ok(closed);
  // Turned a quarter: its long axis runs up the screen (along y on the ground).
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  assert.ok(Math.abs(spanX - 16 * v.scale) < 0.5, `${spanX}`);
  assert.ok(Math.abs(spanY - 40 * v.scale * v.sp) < 0.5, `${spanY}`);
});

test('a bench faces into its park, set at a slant of 20 to 30 degrees; trees and fountains cast round shadows', () => {
  const map = { blocks: [{ x: 0, y: 0, w: 600, h: 600 }], obstacles: [] };
  const turns = [];
  for (const [b, want] of [
    [{ kind: 'bench', x: 100, y: 80, w: 52, h: 16 }, Math.PI / 2], // north side: faces south, into the park
    [{ kind: 'bench', x: 100, y: 500, w: 52, h: 16 }, -Math.PI / 2],
    [{ kind: 'bench', x: 60, y: 200, w: 16, h: 52 }, 0],
    [{ kind: 'bench', x: 520, y: 200, w: 16, h: 52 }, Math.PI],
  ]) {
    const m = modelFor(b, map);
    assert.equal(m.data.heading, want);
    turns.push(m.data.turn);
    assert.ok(Math.abs(m.data.turn) >= 20 * DEG && Math.abs(m.data.turn) <= 30 * DEG, `${m.data.turn / DEG} degrees`);
    assert.equal(m.round[2], want + m.data.turn + Math.PI / 2, 'its shadow along its length');
  }
  for (let k = 0; k < 20; k++) turns.push(modelFor({ kind: 'bench', x: 100 + k * 23, y: 300 + k * 7, w: 52, h: 16 }, map).data.turn);
  assert.ok(turns.some((t) => t > 0) && turns.some((t) => t < 0), 'either way');
  const park = modelFor({ kind: 'tree', x: 0, y: 0, w: 36, h: 36, seed: 3 }, map);
  assert.ok(park.round && park.cullH > park.h && park.wide > 0, 'a park tree: a round shadow, culled by its height on screen');
  assert.equal(modelFor({ kind: 'tree', x: 0, y: 0, w: 16, h: 16, bare: true, seed: 3 }, map).shadow, false, 'bare boughs: none');
  assert.ok(modelFor({ kind: 'fountain', x: 0, y: 0, w: 96, h: 96 }, map).round, 'a fountain: round');
});

test('the city: parks railed in iron (building sites in chain link), grass under them, fewer street trees', () => {
  assert.ok(TEXTURE_SPAN.grass > 100);
  assert.ok(fs.statSync(new URL('../assets/streets/grass.webp', import.meta.url)).size > 10000);
  for (const seed of [1337, 7]) {
    const map = addScavenging(addWorldFeatures(generateCity(seed), seed, { holdout: true, routes: true, landmarks: true }), seed, { stashes: true, rooms: true, secret: true });
    const inBlock = (o, type) => map.blocks.some((b) => b.type === type && o.x >= b.x && o.x <= b.x + b.w && o.y >= b.y && o.y <= b.y + b.h);
    const fences = map.obstacles.filter((o) => o.kind === 'fence');
    assert.ok(fences.some((o) => o.iron));
    for (const f of fences) assert.equal(!!f.iron, inBlock(f, 'park'), `${f.x},${f.y}`);
    const trees = furnishStreets(map, seed).filter((o) => o.kind === 'tree');
    assert.ok(trees.length > 55 && trees.length < 130, `seed ${seed}: ${trees.length} street trees`);
  }
});
