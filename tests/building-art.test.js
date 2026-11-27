// The Building drawn after its Dollhouse concept: light floors textured per kind of room (painted
// once into the ground cache, which now takes the Building's turned camera: ground-cache.test.js),
// walls cut at waist height with solid black tops, and its furniture as baked 3D models
// (src/render/prop-art.js; made with Scenario and tools/props/build_props.py) facing into their
// rooms; the lights are the game's own, as before.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const { PROPS, propPitch, propSize } = await import('../src/render/prop-art.js');
const { decodeMesh } = await import('../src/render/zombie-bake.js');
const { modelFor, faceIntoRoom, CUT_TOP } = await import('../src/render/models.js');
const { TEXTURE_SPAN } = await import('../src/render/textures.js');
const { FLOORS, CORRIDOR_FLOOR } = await import('../src/render/renderer.js');
const { buildDecorProps } = await import('../src/render/decor3d.js');
const { generateBuilding } = await import('../src/world/building-gen.js');

const FURNITURE = ['desk', 'chair', 'cabinet', 'bed', 'shelf', 'plant', 'vending', 'couch', 'table', 'armchair'];
const DEG = Math.PI / 180;

test('the floors: a texture and a light colour for every kind of room the Building has, the textures small and beside them', () => {
  const map = generateBuilding(7);
  const kinds = new Set(map.rooms.map((r) => r.type));
  assert.ok(kinds.size >= 6, [...kinds].join());
  for (const k of kinds) assert.ok(FLOORS[k], `${k} has a floor`);
  for (const [k, f] of Object.entries({ ...FLOORS, corridor: CORRIDOR_FLOOR })) {
    assert.ok(TEXTURE_SPAN[f.tex] > 0, `${k}: ${f.tex}`);
    // Light enough that the night's dark leaves them readable (the old floors were near black).
    const n = parseInt(f.color.slice(1), 16);
    const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    assert.ok(lum > 85, `${k} ${f.color} is light (${lum.toFixed(0)})`);
  }
  // Each kind of room reads at a glance: the corridors, offices, wards and storerooms all differ.
  const looks = new Set(['corridor', 'office', 'openoffice', 'ward', 'warehouse'].map((k) => (k === 'corridor' ? CORRIDOR_FLOOR : FLOORS[k])).map((f) => `${f.tex}|${f.color}`));
  assert.equal(looks.size, 5);
  // The cafeteria's checker is on the tiles' own grid (four tiles a repeat).
  assert.ok(FLOORS.cafeteria.color2 && FLOORS.cafeteria.tex === 'tiles' && TEXTURE_SPAN.tiles % 4 === 0);
  for (const f of ['tiles', 'carpet', 'lino', 'concrete']) {
    const b = fs.readFileSync(new URL(`../assets/building/${f}.webp`, import.meta.url));
    assert.equal(b.toString('ascii', 8, 12), 'WEBP', f);
    assert.ok(b.length < 60000, `${f}: ${b.length} bytes`);
  }
});

test('the walls: cut at waist height, their tops solid black, their faces light; glass too; only in the Building', () => {
  const inside = { theme: 'interior', obstacles: [] };
  const wall = modelFor({ kind: 'wall', x: 0, y: 0, w: 200, h: 14, color: '#5a5650' }, inside);
  assert.equal(wall.data.cut, true);
  assert.notEqual(wall.data.wall, '#5a5650');
  const n = parseInt(wall.data.wall.slice(1), 16);
  assert.ok((n >> 16) > 150, `light face ${wall.data.wall}`);
  assert.equal(CUT_TOP, '#141416');
  const safe = modelFor({ kind: 'wall', x: 0, y: 0, w: 200, h: 14, color: '#3d5a45', safe: true }, inside);
  assert.ok(safe.data.cut && safe.data.wall !== wall.data.wall, 'the safe room keeps its green, lighter');
  assert.equal(modelFor({ kind: 'glass', x: 0, y: 0, w: 120, h: 14 }, inside).data.cut, true);
  const street = modelFor({ kind: 'wall', x: 0, y: 0, w: 200, h: 14 }, { theme: undefined, obstacles: [] });
  assert.ok(!street.data.cut, 'not on the other maps');
});

test('the furniture: whole meshes standing on the ground, no outline, each the right way round and fitted to its footprint', () => {
  for (const name of FURNITURE) {
    const p = PROPS[name];
    assert.ok(p, name);
    const m = decodeMesh(p.mesh);
    for (const i of m.tri) assert.ok(i < m.n, name);
    assert.ok(p.mesh.box[0][2] >= 0, `${name} stands on the ground`);
    assert.equal(fs.readFileSync(new URL(`../${p.texture}`, import.meta.url)).toString('ascii', 8, 12), 'WEBP', name);
    assert.ok(!p.paint, name);
    // No outline: the Dollhouse's furniture is softly shaded. (Shells double the vertices, the
    // second half all at the texture's black band.)
    const src = fs.readFileSync(new URL(`../assets/props/${name}.js`, import.meta.url), 'utf8');
    assert.ok(src.includes('no outline'), `${name} built with --shell 0`);
    // It leans a little toward the Building's steep camera, never past the floor of 35 degrees.
    assert.ok(p.tilt > 0 && p.tilt <= 16, name);
    assert.ok(propPitch(name, 70 * DEG) < 70 * DEG && propPitch(name, 70 * DEG) >= 35 * DEG - 1e-9, name);
  }
  // Their fronts (a: forward): a desk, a sofa, a shelf and a vending machine face across their
  // short side; a bed lies along its length, foot first; a filing cabinet is deeper than wide.
  for (const name of ['desk', 'couch', 'shelf', 'vending']) {
    const [len, wid] = propSize(name);
    assert.ok(wid > len, `${name}: ${len.toFixed(1)} deep, ${wid.toFixed(1)} wide`);
  }
  for (const name of ['bed', 'cabinet']) {
    const [len, wid] = propSize(name);
    assert.ok(len > wid, `${name}: ${len.toFixed(1)} long, ${wid.toFixed(1)} wide`);
  }
  const [al, aw] = propSize('armchair');
  assert.ok(Math.abs(al - aw) < 0.2 * al, 'an armchair is about square');
  // A plant's leaves and a cafeteria table's chairs spread past their footprints.
  assert.ok(PROPS.plant.grow > 1 && PROPS.table.grow > 1);
});

/** A fake renderer: every model ready, the draws written down. */
function fakeR() {
  const calls = [];
  const R = {
    L: { lit: () => 1, sample: () => 1 },
    v: { depth: (x, y) => x + y, flat: false },
    props: { ready: () => true, drawProp: (R2, name, o, b, heading) => (calls.push({ name, o, heading }), true) },
    calls,
  };
  return R;
}

test('the furniture faces into its room, away from the nearest wall; a filing cabinet along its long side', () => {
  const map = { theme: 'interior', obstacles: [], rooms: [{ x: 0, y: 0, w: 400, h: 300, type: 'office' }] };
  // A desk along the top wall faces down into the room (+y); along the bottom wall, up.
  assert.equal(faceIntoRoom({ x: 100, y: 10, w: 64, h: 34 }, map), Math.PI / 2);
  assert.equal(faceIntoRoom({ x: 100, y: 256, w: 64, h: 34 }, map), -Math.PI / 2);
  // Along the left wall it faces right (+x); along the right wall, left.
  assert.equal(faceIntoRoom({ x: 10, y: 100, w: 34, h: 64 }, map), 0);
  assert.equal(faceIntoRoom({ x: 356, y: 100, w: 34, h: 64 }, map), Math.PI);
  // A cabinet 30 x 22 by the left wall faces along its long side, out of the corner.
  assert.equal(faceIntoRoom({ x: 10, y: 120, w: 30, h: 22 }, map, true), 0);
  const desk = modelFor({ kind: 'desk', x: 100, y: 10, w: 64, h: 34 }, map);
  assert.equal(desk.data.heading, Math.PI / 2);
  const cab = modelFor({ kind: 'cabinet', x: 360, y: 120, w: 30, h: 22 }, map);
  assert.equal(cab.data.heading, Math.PI);
  // A bed's foot points to the middle of its room.
  const bed = modelFor({ kind: 'bed', x: 20, y: 20, w: 92, h: 46 }, map);
  assert.equal(bed.data.heading, 0);
});

test('a long desk is two desks side by side, a run of shelving one bay after another, far ones first', () => {
  const map = { theme: 'interior', obstacles: [], rooms: [{ x: 0, y: 0, w: 900, h: 600, type: 'openoffice' }] };
  const draw = (o) => {
    const R = fakeR();
    const rec = modelFor(o, map);
    rec.draw(R, o, rec);
    return R.calls;
  };
  const desks = draw({ kind: 'desk', x: 100, y: 100, w: 128, h: 34 });
  assert.equal(desks.length, 2);
  assert.ok(desks.every((c) => c.name === 'desk' && c.o.w === 64 && c.o.h === 34));
  assert.ok(desks[0].o.x < desks[1].o.x, 'the far one first');
  assert.equal(draw({ kind: 'desk', x: 100, y: 100, w: 64, h: 34 }).length, 1);
  const bays = draw({ kind: 'shelf', x: 100, y: 100, w: 26, h: 330 });
  assert.equal(bays.length, 3);
  assert.ok(bays.every((c) => c.name === 'shelf' && Math.abs(c.o.h - 110) < 1e-9));
  // A cafeteria table is the table-and-chairs model; a long conference table stays drawn.
  assert.equal(draw({ kind: 'table', x: 100, y: 100, w: 74, h: 44 })[0].name, 'table');
  assert.equal(modelFor({ kind: 'table', x: 100, y: 100, w: 220, h: 80 }, map).data.set, false);
});

test('lobby seats by footprint: a sofa, an armchair, or two sofas back to back facing out', () => {
  const map = { theme: 'interior', obstacles: [], rooms: [{ x: 0, y: 0, w: 800, h: 800, type: 'lobby' }] };
  const draw = (o) => {
    const R = fakeR();
    const rec = modelFor(o, map);
    rec.draw(R, o, rec);
    return R.calls;
  };
  assert.deepEqual(draw({ kind: 'couch', x: 300, y: 300, w: 92, h: 34 }).map((c) => c.name), ['couch']);
  assert.deepEqual(draw({ kind: 'couch', x: 300, y: 300, w: 34, h: 34 }).map((c) => c.name), ['armchair']);
  const pair = draw({ kind: 'couch', x: 300, y: 300, w: 92, h: 92 });
  assert.equal(pair.length, 2);
  assert.ok(pair.every((c) => c.name === 'couch' && c.o.h === 46));
  const top = pair.find((c) => c.o.y === 300);
  const bottom = pair.find((c) => c.o.y === 346);
  assert.equal(top.heading, -Math.PI / 2);
  assert.equal(bottom.heading, Math.PI / 2);
});

test('the office chairs left about the floor: each turned one of sixteen ways', () => {
  const map = generateBuilding(11);
  const props = buildDecorProps({ map }, { gx: 0, gy: 1, flat: false });
  const chairs = props.filter((p) => p.d && p.d.type === 'chair');
  assert.ok(chairs.length > 20, `${chairs.length} chairs`);
  const turns = new Set(chairs.map((p) => Math.round(p.turn / ((2 * Math.PI) / 16))));
  assert.ok(turns.size >= 8, `${turns.size} ways`);
  for (const p of chairs) assert.ok(Math.abs(p.turn / ((2 * Math.PI) / 16) - Math.round(p.turn / ((2 * Math.PI) / 16))) < 1e-9);
});
