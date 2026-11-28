// The Tank's and the Hunter's 3D models (tools/specials/models, built by tools/specials/build_specials.py):
// the files are whole and laid out the way the zombies' models are.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';

const DIR = new URL('../tools/specials/models/', import.meta.url);
const read = (name) => readFileSync(new URL(name, DIR));
const PARTS = ['torso', 'head', 'arm_l', 'arm_r', 'leg_l', 'leg_r'];
// The zombies' palette strip (assets/zombies/meshes.js: PALETTE) and the two swatches their meshes use.
const PALETTE = [0.0, 0.85, 0.07, 1.0];
const WHITE = [0.0412, 0.962];
const BLACK = [0.039, 0.872];
// How tall each stands, in metres in the GLB (the zombies' FBX units, centimetres, / 100): a zombie is about 4.1.
const HEIGHT = { tank: [5.5, 7.0], hunter: [3.5, 5.0] };

/** RGB of a PNG's pixels (8-bit RGB or RGBA, not interlaced). */
function readPNG(buf) {
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  let off = 8;
  let w = 0;
  let h = 0;
  let ch = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      assert.equal(data[8], 8, '8 bits a channel');
      ch = { 2: 3, 6: 4 }[data[9]];
      assert.ok(ch, 'RGB or RGBA');
    } else if (type === 'IDAT') idat.push(data);
    off += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = new Uint8Array(w * h * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0, p = 0; y < h; y++) {
    const f = raw[p++];
    const line = new Uint8Array(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) px[(y * w + x) * 3 + k] = line[x * ch + k];
    prev = line;
  }
  return { w, h, at: (u, v) => Array.from(px.subarray(((Math.floor((1 - v) * h)) * w + Math.floor(u * w)) * 3, ((Math.floor((1 - v) * h)) * w + Math.floor(u * w)) * 3 + 3)) };
}

/** The JSON and binary chunks of a GLB. */
function readGLB(buf) {
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'glTF magic');
  assert.equal(buf.readUInt32LE(4), 2, 'glTF 2');
  assert.equal(buf.readUInt32LE(8), buf.length, 'length in the header');
  const jl = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'JSON chunk first');
  const json = JSON.parse(buf.toString('utf8', 20, 20 + jl));
  const bo = 20 + jl;
  assert.equal(buf.readUInt32LE(bo + 4), 0x004e4942, 'then the BIN chunk');
  const bin = buf.subarray(bo + 8, bo + 8 + buf.readUInt32LE(bo));
  return { json, bin };
}

function accessor(g, bin, i) {
  const a = g.json.accessors[i];
  const v = g.json.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
  const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
  const bytes = bin.subarray(v.byteOffset, v.byteOffset + v.byteLength);
  return { a, n, data: new T(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)) };
}

for (const name of ['tank', 'hunter']) {
  test(`${name}: the texture is 2048 px with the zombies' palette strip where theirs is`, () => {
    const png = readPNG(read(`${name}.png`));
    assert.equal(png.w, 2048);
    assert.equal(png.h, 2048);
    assert.deepEqual(png.at(...WHITE), [255, 255, 255], 'eye white');
    assert.deepEqual(png.at(...BLACK), [0, 0, 0], 'black: outlines, pupils, mouths');
  });

  test(`${name}: the GLB has a node per part (the torso the parent of the rest), meshes whole, the texture inside`, () => {
    const g = readGLB(read(`${name}.glb`));
    const { json, bin } = g;
    assert.equal(json.buffers[0].byteLength, bin.length);
    assert.deepEqual(json.nodes.map((n) => n.name).sort(), PARTS.map((p) => `${name}_${p}`).sort());
    const torso = json.nodes.findIndex((n) => n.name === `${name}_torso`);
    assert.deepEqual(json.scenes[0].nodes, [torso]);
    assert.equal(json.nodes[torso].children.length, PARTS.length - 1);
    // One material, its colour from the texture, which is the PNG beside the GLB.
    assert.equal(json.materials.length, 1);
    const img = json.images[json.textures[json.materials[0].pbrMetallicRoughness.baseColorTexture.index].source];
    assert.equal(img.mimeType, 'image/png');
    const v = json.bufferViews[img.bufferView];
    assert.ok(Buffer.compare(bin.subarray(v.byteOffset, v.byteOffset + v.byteLength), read(`${name}.png`)) === 0, 'the same texture as the PNG');
    let lo = Infinity;
    let hi = -Infinity;
    for (const node of json.nodes) {
      const prim = json.meshes[node.mesh].primitives[0];
      assert.equal(prim.material, 0);
      const pos = accessor(g, bin, prim.attributes.POSITION);
      const nrm = accessor(g, bin, prim.attributes.NORMAL);
      const uv = accessor(g, bin, prim.attributes.TEXCOORD_0);
      const idx = accessor(g, bin, prim.indices);
      const n = pos.a.count;
      assert.ok(idx.data.length % 3 === 0 && idx.data.length / 3 > 100, `${node.name}: a real mesh`);
      for (const i of idx.data) assert.ok(i < n, `${node.name}: corner in range`);
      let black = 0;
      for (let i = 0; i < n; i++) {
        assert.ok(Math.abs(Math.hypot(nrm.data[i * 3], nrm.data[i * 3 + 1], nrm.data[i * 3 + 2]) - 1) < 1e-3, `${node.name}: unit normals`);
        const u = uv.data[i * 2];
        const t = 1 - uv.data[i * 2 + 1]; // glTF's v runs down
        assert.ok(u >= 0 && u <= 1 && t >= 0 && t <= 1, `${node.name}: UVs on the texture`);
        if (Math.abs(u - BLACK[0]) < 1e-3 && Math.abs(t - BLACK[1]) < 1e-3) black++;
      }
      // Every piece has its black outline shell (an inverted hull): a fair share of the mesh.
      assert.ok(black > n * 0.25, `${node.name}: has outline shells (${black} of ${n})`);
      // Where it stands: the part's box moved to its joint (the poses only turn arms and the head,
      // which stay inside the bounds checked below).
      const t0 = (node.translation || [0, 0, 0])[1];
      if (!node.name.includes('arm')) {
        lo = Math.min(lo, pos.a.min[1] + t0);
        hi = Math.max(hi, pos.a.max[1] + t0);
      }
    }
    // Standing on the ground (the outline reaches a little under it), as tall as it should be.
    assert.ok(lo > -0.12 && lo < 0.05, `${name} stands on the ground (${lo})`);
    assert.ok(hi > HEIGHT[name][0] && hi < HEIGHT[name][1], `${name} is ${hi.toFixed(2)} m tall`);
  });

  test(`${name}: the FBX is a binary FBX 7.4 laid out as the zombies' is: a model per part`, () => {
    const buf = read(`${name}.fbx`);
    assert.equal(buf.toString('latin1', 0, 23), 'Kaydara FBX Binary  \x00\x1a\x00');
    assert.equal(buf.readUInt32LE(23), 7400);
    // Blender's footer: the version again, then its closing magic.
    assert.equal(buf.toString('hex', buf.length - 16), 'f85a8c6adef5d97eece90ce3758f290b');
    assert.equal(buf.readUInt32LE(buf.length - 16 - 120 - 4), 7400);
    for (const p of PARTS) assert.ok(buf.includes(Buffer.from(`${name}_${p}\x00\x01Model`, 'latin1')), `${name}_${p}`);
    assert.ok(buf.includes(Buffer.from(`${name}.png`, 'latin1')), 'its texture, by relative path');
  });
}

test('the palette strip is the zombies\' (the game keeps those UVs whatever the colour block)', () => {
  assert.ok(WHITE[0] >= PALETTE[0] && WHITE[0] <= PALETTE[2] && WHITE[1] >= PALETTE[1] && WHITE[1] <= PALETTE[3]);
  assert.ok(BLACK[0] >= PALETTE[0] && BLACK[0] <= PALETTE[2] && BLACK[1] >= PALETTE[1] && BLACK[1] <= PALETTE[3]);
});
