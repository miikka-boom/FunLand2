// The parked cars as a baked 3D model (src/render/prop-art.js, assets/props/car.js, made with
// Scenario and tools/props/build_props.py): the mesh, its paint swapped per colour, which way a
// parked car faces, and drawing it as a sprite as bright as the light where it stands.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.atob ??= (s) => Buffer.from(s, 'base64').toString('binary');
const { CAR, CAR_TEXTURE } = await import('../assets/props/car.js');
const { decodeMesh } = await import('../src/render/zombie-bake.js');
const { PropArt, recolorPaint, isPaint, carHeading } = await import('../src/render/prop-art.js');
const { IsoView } = await import('../src/iso.js');

test('the car: a whole mesh with its outline shells, car-sized, its texture beside it', async () => {
  const m = decodeMesh(CAR);
  assert.equal(m.pos.length, m.n * 3);
  assert.equal(m.tri.length % 3, 0);
  for (const i of m.tri) assert.ok(i < m.n);
  for (let i = 0; i < m.n; i++) assert.ok(Math.abs(Math.hypot(m.nrm[i * 3], m.nrm[i * 3 + 1], m.nrm[i * 3 + 2]) - 1) < 0.02, 'unit normals');
  const [lo, hi] = CAR.box;
  const len = (hi[0] - lo[0]) / 10;
  const wid = (hi[1] - lo[1]) / 10;
  const tall = (hi[2] - lo[2]) / 10;
  assert.ok(len > 70 && len < 86, `${len} world units long: fits a parking space (86)`);
  assert.ok(wid > 30 && wid < 44 && tall > 20 && tall < 36, `${wid} wide, ${tall} tall`);
  assert.ok(lo[2] >= 0, 'standing on the ground');
  // Half of it is the shell: the same vertices pushed out, black (the top band of the texture).
  const shell = [];
  for (let i = m.n / 2; i < m.n; i++) shell.push(m.uv[i * 2 + 1]);
  assert.ok(shell.every((v) => v > 0.98), 'the shells take their colour from the black band');
  const fs = await import('node:fs');
  assert.equal(fs.readFileSync(new URL(`../${CAR_TEXTURE}`, import.meta.url)).toString('ascii', 8, 12), 'WEBP');
});

test('its paint: green swapped for a car\'s colour, light and dark kept; everything else as it was', () => {
  assert.ok(isPaint(44, 93, 29) && isPaint(70, 150, 50), 'the green paint');
  assert.ok(!isPaint(20, 22, 30) && !isPaint(120, 120, 120) && !isPaint(200, 40, 40) && !isPaint(30, 34, 60), 'not the windows, chrome, tail lights');
  const src = new Uint8ClampedArray([
    44, 93, 29, 255, // paint
    66, 140, 44, 255, // lit paint
    22, 46, 14, 255, // paint in shadow
    20, 22, 30, 255, // window
    200, 40, 40, 255, // tail light
  ]);
  const out = recolorPaint(src, [180, 40, 40]);
  const lum = (o) => 0.299 * out[o] + 0.587 * out[o + 1] + 0.114 * out[o + 2];
  assert.ok(out[0] > out[1] * 2 && out[0] > out[2] * 2, 'red now');
  assert.ok(lum(4) > lum(0) && lum(0) > lum(8), 'its light and shade kept');
  assert.deepEqual([...out.slice(12, 20)], [20, 22, 30, 255, 200, 40, 40, 255], 'window and light untouched');
});

test('which way a parked car faces: along its length, its front at the end it says', () => {
  assert.equal(carHeading({ w: 86, h: 44, front: 1 }), 0);
  assert.equal(carHeading({ w: 86, h: 44, front: -1 }), Math.PI);
  assert.equal(carHeading({ w: 44, h: 86, front: 1 }), Math.PI / 2);
  assert.equal(carHeading({ w: 44, h: 86, front: -1 }), -Math.PI / 2);
  assert.equal(carHeading({ w: 86, h: 44 }), 0, 'front at +x unless told');
});

// A canvas that writes down what is drawn on it.
let drawn = [];
function fakeCanvas() {
  const c = { width: 0, height: 0, fills: 0 };
  c.getContext = () => ({
    canvas: c,
    globalCompositeOperation: 'source-over',
    setTransform() {},
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
    fillRect() {
      c.fills++;
    },
    drawImage: (src, x, y) => drawn.push({ to: c, src, x, y }),
  });
  return c;
}

test('a parked car is its sprite, baked once per colour and side, as bright as its light', async () => {
  // A small stand-in for the texture: all green paint.
  const w = 16;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let i = 0; i < data.length; i += 4) data.set([44, 93, 29, 255], i);
  const art = new PropArt({ makeCanvas: fakeCanvas, loadPixels: async () => ({ w, h: w, data }), budget: Infinity });
  const v = new IsoView(0, (75 * Math.PI) / 180);
  v.setViewport(844, 390, 390 / 470);
  v.lookAt(500, 500);
  const screen = fakeCanvas();
  let resets = 0;
  const R = { ctx: screen.getContext(), v, dpr: 2, reset: () => resets++ };
  const car = { x: 460, y: 480, w: 86, h: 44, front: 1, color: '#6d2e2e' };
  art.begin(v, 2, null);
  assert.equal(art.drawCar(R, car, 1), false, 'not until the texture is in');
  await new Promise((r) => setTimeout(r, 0));
  art.begin(v, 2, null);
  drawn = [];
  assert.equal(art.drawCar(R, car, 1), true);
  assert.equal(art.sprites.size, 1);
  const d = drawn.filter((x) => x.to === screen);
  assert.equal(d.length, 1, 'one draw');
  assert.ok(Number.isInteger(d[0].x) && Number.isInteger(d[0].y), 'on whole pixels');
  // The same colour and side again: no new bake. Another colour, or the other way round: one each.
  art.drawCar(R, { ...car, x: 700 }, 1);
  assert.equal(art.sprites.size, 1);
  art.drawCar(R, { ...car, color: '#2e4a6d' }, 1);
  art.drawCar(R, { ...car, front: -1 }, 1);
  art.drawCar(R, { ...car, w: 44, h: 86 }, 1);
  assert.equal(art.sprites.size, 4);
  // In the dark: a darkened copy (made once), not the sprite itself.
  drawn = [];
  art.drawCar(R, car, 0.4);
  art.drawCar(R, car, 0.4);
  const dark = drawn.filter((x) => x.to === screen);
  const sp = [...art.sprites.values()][0];
  assert.ok(dark[0].src !== sp.canvas && dark[0].src === dark[1].src, 'its darkened copy, made once');
  assert.ok(resets >= 6, 'the renderer\'s transform put back');
  // A new camera or night look: baked again.
  art.begin(v, 2, { id: 'noir', shade: [40, 28, 52], shadeMix: 0.35, warm: [255, 150, 70], warmMix: 0.18 });
  assert.equal(art.sprites.size, 0);
  // Within its budget: one bake a frame at least, no more once past it.
  const slow = new PropArt({ makeCanvas: fakeCanvas, loadPixels: async () => ({ w, h: w, data }), budget: 0 });
  slow.begin(v, 2, null);
  await new Promise((r) => setTimeout(r, 0));
  slow.begin(v, 2, null);
  assert.equal(slow.drawCar(R, car, 1), true, 'the first one always');
  assert.equal(slow.drawCar(R, { ...car, color: '#2e4a6d' }, 1), false, 'the next one next frame');
});
