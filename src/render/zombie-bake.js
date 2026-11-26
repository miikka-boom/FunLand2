// Sprites of the zombie models' parts, baked for the camera (pure JS, no DOM: unit tested in Node).
//
// The artist's zombies (assets/zombies/meshes.js, built from an FBX by tools/zombies/) are real
// 3D meshes with a texture. The game is a 2D canvas, so they are drawn as sprites: each part (a
// head, a torso, an arm, a foot) is rendered here, once per facing, by a small z-buffered
// rasterizer, through the same orthographic camera the world uses (src/iso.js). A sprite only
// depends on the camera's tilt, on the zoom and on how the part is turned relative to the camera,
// so a set baked for 32 facings serves every zombie on screen until the camera changes.
//
// Shading is toon-style, to go with the hand-inked texture: two bands of light with a soft edge,
// and a pale rim on the shadow side of the skin, which keeps a zombie readable on a dark street.
//
// Outlines come with the meshes: every piece has a shell (the same shape a little bigger, faces
// turned inward, coloured black), and culling its near side leaves a black rim around the piece.
// The triangles are wound so that (b - a) x (c - a) points along the normals, outward for skin and
// inward for a shell, so one rule culls both: draw what turns its winding toward the camera.

import { POS_Q, PALETTE } from '../../assets/zombies/meshes.js';

const b64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

/** A mesh from the data module: positions (model units, relative to its pivot), unit normals, UVs, triangles. */
export function decodeMesh(m) {
  const p = new Int16Array(b64(m.pos));
  const n = new Int8Array(b64(m.nrm));
  const t = new Uint16Array(b64(m.uv));
  const pos = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) pos[i] = p[i] / POS_Q;
  const nrm = new Float32Array(n.length);
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    nrm[i] = n[i] / l;
    nrm[i + 1] = n[i + 1] / l;
    nrm[i + 2] = n[i + 2] / l;
  }
  const uv = new Float32Array(t.length);
  const pal = new Uint8Array(m.n); // 1: a palette UV (it stays put whatever the colour block)
  for (let i = 0; i < m.n; i++) {
    const u = (uv[i * 2] = t[i * 2] / 65535);
    const v = (uv[i * 2 + 1] = t[i * 2 + 1] / 65535);
    pal[i] = u >= PALETTE[0] && u <= PALETTE[2] && v >= PALETTE[1] && v <= PALETTE[3] ? 1 : 0;
  }
  const grp = m.grp ? new Uint8Array(b64(m.grp)) : null; // a head's googly eyes (meshes.js: HEADS)
  return { n: m.n, pos, nrm, uv, pal, grp, tri: new Uint16Array(b64(m.tri)), box: m.box };
}

/** RGBA pixels with box-filtered mip levels (level 0 first). */
export class Texture {
  constructor(w, h, rgba) {
    this.levels = [{ w, h, d: rgba }];
    let cur = this.levels[0];
    while (cur.w > 16 && cur.h > 16) {
      const w2 = cur.w >> 1;
      const h2 = cur.h >> 1;
      const d2 = new Uint8ClampedArray(w2 * h2 * 4);
      const s = cur.d;
      for (let y = 0; y < h2; y++) {
        for (let x = 0; x < w2; x++) {
          const a = (y * 2 * cur.w + x * 2) * 4;
          const b = a + cur.w * 4;
          const o = (y * w2 + x) * 4;
          for (let c = 0; c < 4; c++) d2[o + c] = (s[a + c] + s[a + 4 + c] + s[b + c] + s[b + 4 + c] + 2) >> 2;
        }
      }
      cur = { w: w2, h: h2, d: d2 };
      this.levels.push(cur);
    }
  }
}

// Light from up high, a little from the left and from the camera's side (fixed to the camera, as the
// world's own lighting is: tops brightest, then the walls that face the camera).
// [screen right, along the ground toward the camera, up]
export const LIGHT = unit([-0.42, 0.34, 0.84]);
/** Toon shading: the shadow band, the lit band (multiples of the texture's colour), where the edge between them falls (n . light), and the rim. */
export const SHADE = { dark: 0.74, lit: 1.03, edge0: 0.06, edge1: 0.2, rim: 0.32 };
export const RIM_COLOUR = [210, 236, 222];
const RIM0 = 0.42; // the rim fades in from here (1 - n . view: 0 facing the camera, 1 edge-on)...
const RIM1 = 0.82; // ...to full here

function unit(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

// Scratch space, grown as needed (one bake at a time).
let cap = 0;
let VX;
let VY;
let VD;
let VL;
let VN;
let VU;
let VV;
let bufCap = 0;
let ZB;
let CR;
let CG;
let CB;
let RM;

function grow(n) {
  if (n <= cap) return;
  cap = Math.max(n, cap * 2, 2048);
  VX = new Float32Array(cap);
  VY = new Float32Array(cap);
  VD = new Float32Array(cap);
  VL = new Float32Array(cap);
  VN = new Float32Array(cap);
  VU = new Float32Array(cap);
  VV = new Float32Array(cap);
}

function growBuf(n) {
  if (n <= bufCap) return;
  bufCap = Math.max(n, bufCap * 2, 16384);
  ZB = new Float32Array(bufCap);
  CR = new Float32Array(bufCap);
  CG = new Float32Array(bufCap);
  CB = new Float32Array(bufCap);
  RM = new Float32Array(bufCap);
}

/**
 * Bake meshes into one sprite.
 *   items  [{ mesh (decodeMesh), shift: [du, dv] (its colour block; palette UVs don't move),
 *            at: [a, c, h] where its pivot sits in the body, yaw: radians it is swung toward its
 *            right about the upright through its pivot, then pitch: radians it is raised about
 *            its pivot's side-to-side axis (arms), eye: a head's googly eyes as { pupils: [[dc, dh],
 *            [dc, dh]] (model units, left eye then right), shut: 0..1 }, blood: splats painted on
 *            it, [[a, c, h, r], ...] in its own axes (model units) }]
 *   tex    Texture
 *   o      { phi: the body's facing relative to the camera (0: facing screen right, PI/2: facing
 *            the camera), lie: radians the whole body is tipped back about its side-to-side axis
 *            (PI/2: on its back, face up; -PI/2: on its face; corpses), roll: radians it is first
 *            rolled about its front-to-back axis (PI/2: onto its left side), sp, cp: sine and
 *            cosine of the camera's tilt, ppu: final pixels per model unit, ss: samples per pixel
 *            along each axis, shade: SHADE overrides }
 * Returns { w, h, ox, oy, rgba, depth, rim }: the body's origin is at (ox, oy) px; rgba is straight
 * (not premultiplied) alpha; depth (model units toward the camera, from the origin) is -Infinity
 * where the sprite is empty; rim (0..255) is how much of each pixel is rim light.
 */
export function bake(items, tex, o) {
  let total = 0;
  for (const it of items) total += it.mesh.n;
  grow(total);
  const ss = o.ss || 2;
  const ppu = o.ppu * ss;
  const sp = o.sp;
  const cp = o.cp;
  const cf = Math.cos(o.phi);
  const sf = Math.sin(o.phi);
  const lie = o.lie || 0;
  const cl = Math.cos(lie);
  const sl = Math.sin(lie);
  const roll = o.roll || 0;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  // The light in the body's axes (a forward, c right, h up).
  const L = o.light || LIGHT;
  const la = L[0] * cf + L[1] * sf;
  const lc = -L[0] * sf + L[1] * cf;
  const lh = L[2];
  // Toward the camera, in the same axes.
  const va = sf * cp;
  const vc = cf * cp;
  const vh = sp;
  const sh = o.shade ? { ...SHADE, ...o.shade } : SHADE;

  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let base = 0;
  for (const it of items) {
    const { n, pos, nrm, uv, pal } = it.mesh;
    const at = it.at || ZERO;
    const pitch = it.pitch || 0;
    const cq = Math.cos(pitch);
    const sq = Math.sin(pitch);
    const yaw = it.yaw || 0;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const du = it.shift ? it.shift[0] : 0;
    const dv = it.shift ? it.shift[1] : 0;
    const grp = it.eye && it.mesh.grp;
    const eyes = it.eyes;
    for (let i = 0; i < n; i++) {
      let a = pos[i * 3];
      let c = pos[i * 3 + 1];
      let h = pos[i * 3 + 2];
      let na = nrm[i * 3];
      let nc = nrm[i * 3 + 1];
      let nh = nrm[i * 3 + 2];
      if (grp && grp[i]) {
        // Googly eyes: the pupils roll about in front of the whites; a shut eye is squashed flat.
        const g = grp[i];
        const e = g === 1 || g === 3 ? 0 : 1;
        if (g >= 3) {
          const off = it.eye.pupils[e];
          c += off[0];
          h += off[1];
          a += 3; // a little proud of the white, so it stays in front wherever it rolls
        }
        if (it.eye.shut) {
          const mid = eyes[e].mid[2];
          h = mid + (h - mid) * (1 - 0.88 * it.eye.shut);
        }
      }
      if (yaw) {
        const a2 = a * cy - c * sy;
        c = a * sy + c * cy;
        a = a2;
        const n2 = na * cy - nc * sy;
        nc = na * sy + nc * cy;
        na = n2;
      }
      c += at[1];
      if (pitch) {
        const a2 = a * cq - h * sq;
        h = a * sq + h * cq;
        a = a2;
        const n2 = na * cq - nh * sq;
        nh = na * sq + nh * cq;
        na = n2;
      }
      a += at[0];
      h += at[2];
      if (roll) {
        const c2 = c * cr - h * sr;
        h = c * sr + h * cr;
        c = c2;
        const n2 = nc * cr - nh * sr;
        nh = nc * sr + nh * cr;
        nc = n2;
      }
      if (lie) {
        const a2 = a * cl - h * sl;
        h = a * sl + h * cl;
        a = a2;
        const n2 = na * cl - nh * sl;
        nh = na * sl + nh * cl;
        na = n2;
      }
      const j = base + i;
      const g = a * sf + c * cf; // along the ground toward the camera
      const x = (VX[j] = ppu * (a * cf - c * sf));
      const y = (VY[j] = ppu * (g * sp - h * cp));
      VD[j] = g * cp + h * sp;
      VL[j] = na * la + nc * lc + nh * lh;
      VN[j] = na * va + nc * vc + nh * vh;
      if (pal[i]) {
        VU[j] = uv[i * 2];
        VV[j] = uv[i * 2 + 1];
      } else {
        VU[j] = uv[i * 2] + du;
        VV[j] = uv[i * 2 + 1] + dv;
      }
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    base += n;
  }

  // The sprite: whole final pixels, one spare on each side.
  const fx0 = Math.floor(x0 / ss) - 1;
  const fy0 = Math.floor(y0 / ss) - 1;
  const fw = Math.max(1, Math.ceil(x1 / ss) + 1 - fx0);
  const fh = Math.max(1, Math.ceil(y1 / ss) + 1 - fy0);
  const W = fw * ss;
  const H = fh * ss;
  growBuf(W * H);
  ZB.fill(-Infinity, 0, W * H);
  const ox = fx0 * ss;
  const oy = fy0 * ss;
  const L0 = tex.levels[0];
  const t0 = L0.d;

  base = 0;
  for (const it of items) {
    const tri = it.mesh.tri;
    const pal = it.mesh.pal;
    const P = it.mesh.pos; // its own axes, for the blood
    const blood = it.blood && it.blood.length ? it.blood : null;
    // Texture level: about one texel per sample on the textured triangles.
    let tA = 0;
    let sA = 0;
    for (let t = 0; t < tri.length; t += 3) {
      const i0 = base + tri[t];
      const i1 = base + tri[t + 1];
      const i2 = base + tri[t + 2];
      const area = (VX[i1] - VX[i0]) * (VY[i2] - VY[i0]) - (VX[i2] - VX[i0]) * (VY[i1] - VY[i0]);
      if (area <= 0) continue;
      const ua = Math.abs((VU[i1] - VU[i0]) * (VV[i2] - VV[i0]) - (VU[i2] - VU[i0]) * (VV[i1] - VV[i0])) * L0.w * L0.h;
      if (ua < 1e-3) continue;
      tA += ua;
      sA += area;
    }
    const lv = sA > 0 ? Math.max(0, Math.min(tex.levels.length - 1, Math.round(Math.log2(Math.sqrt(tA / sA))))) : 0;
    const T = tex.levels[lv];
    const tw = T.w;
    const th = T.h;
    const td = T.d;

    for (let t = 0; t < tri.length; t += 3) {
      const i0 = base + tri[t];
      const i1 = base + tri[t + 1];
      const i2 = base + tri[t + 2];
      const ax = VX[i0] - ox;
      const ay = VY[i0] - oy;
      const bx = VX[i1] - ox;
      const by = VY[i1] - oy;
      const cx = VX[i2] - ox;
      const cy = VY[i2] - oy;
      const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
      if (area <= 1e-9) continue; // turned away (or edge-on)
      let px0 = Math.floor(Math.min(ax, bx, cx));
      let px1 = Math.ceil(Math.max(ax, bx, cx));
      let py0 = Math.floor(Math.min(ay, by, cy));
      let py1 = Math.ceil(Math.max(ay, by, cy));
      if (px0 < 0) px0 = 0;
      if (py0 < 0) py0 = 0;
      if (px1 > W) px1 = W;
      if (py1 > H) py1 = H;
      if (px0 >= px1 || py0 >= py1) continue;
      const inv = 1 / area;
      const d0 = VD[i0];
      const d1 = VD[i1];
      const d2 = VD[i2];
      const l0 = VL[i0];
      const l1 = VL[i1];
      const l2 = VL[i2];
      const n0 = VN[i0];
      const n1 = VN[i1];
      const n2 = VN[i2];
      // The rim (and blood) are for skin and clothes, not for the palette's black lines and white eyes.
      const palette = pal[tri[t]] && pal[tri[t + 1]] && pal[tri[t + 2]];
      const rim = palette ? 0 : sh.rim;
      const q0 = tri[t] * 3;
      const q1 = tri[t + 1] * 3;
      const q2 = tri[t + 2] * 3;
      // The splats that can reach this triangle (most triangles have none).
      let nb = 0;
      if (blood && !palette) {
        const a0 = Math.min(P[q0], P[q1], P[q2]);
        const a1 = Math.max(P[q0], P[q1], P[q2]);
        const c0 = Math.min(P[q0 + 1], P[q1 + 1], P[q2 + 1]);
        const c1 = Math.max(P[q0 + 1], P[q1 + 1], P[q2 + 1]);
        const h0 = Math.min(P[q0 + 2], P[q1 + 2], P[q2 + 2]);
        const h1 = Math.max(P[q0 + 2], P[q1 + 2], P[q2 + 2]);
        for (let k = 0; k < blood.length && nb < NEAR.length; k++) {
          const b = blood[k];
          const r = b[3] * EDGE;
          if (a1 >= b[0] - r && a0 <= b[0] + r && c1 >= b[1] - r && c0 <= b[1] + r && h1 >= b[2] - r * DRIP && h0 <= b[2] + r) NEAR[nb++] = k;
        }
      }
      const u0 = VU[i0];
      const v0 = VV[i0];
      const u1 = VU[i1];
      const v1 = VV[i1];
      const u2 = VU[i2];
      const v2 = VV[i2];
      // One colour for the whole triangle when its corners share a UV (flat swatches, the palette):
      // read from the full-size texture, so a small swatch keeps its colour.
      const flat = Math.abs(u0 - u1) + Math.abs(u0 - u2) + Math.abs(v0 - v1) + Math.abs(v0 - v2) < 1e-5;
      let fr = 0;
      let fg = 0;
      let fb = 0;
      if (flat) {
        const sx = Math.min(L0.w - 1, Math.max(0, (u0 * L0.w) | 0));
        const sy = Math.min(L0.h - 1, Math.max(0, ((1 - v0) * L0.h) | 0));
        const q = (sy * L0.w + sx) * 4;
        fr = t0[q];
        fg = t0[q + 1];
        fb = t0[q + 2];
      }
      // Barycentric weights at the first sample centre, stepped per sample.
      const e0x = (by - cy) * inv;
      const e0y = (cx - bx) * inv;
      const e1x = (cy - ay) * inv;
      const e1y = (ax - cx) * inv;
      const sx0 = px0 + 0.5;
      const sy0 = py0 + 0.5;
      let w0r = ((bx - sx0) * (cy - sy0) - (cx - sx0) * (by - sy0)) * inv;
      let w1r = ((cx - sx0) * (ay - sy0) - (ax - sx0) * (cy - sy0)) * inv;
      for (let py = py0; py < py1; py++) {
        let w0 = w0r;
        let w1 = w1r;
        let idx = py * W + px0;
        for (let px = px0; px < px1; px++, idx++, w0 += e0x, w1 += e1x) {
          const w2 = 1 - w0 - w1;
          if (w0 < -1e-7 || w1 < -1e-7 || w2 < -1e-7) continue;
          const d = w0 * d0 + w1 * d1 + w2 * d2;
          if (d <= ZB[idx]) continue;
          ZB[idx] = d;
          const l = w0 * l0 + w1 * l1 + w2 * l2;
          let band = (l - sh.edge0) / (sh.edge1 - sh.edge0);
          band = band <= 0 ? 0 : band >= 1 ? 1 : band * band * (3 - 2 * band);
          const k = sh.dark + (sh.lit - sh.dark) * band;
          let rr = 0;
          if (rim) {
            let f = (1 - (w0 * n0 + w1 * n1 + w2 * n2) - RIM0) / (RIM1 - RIM0);
            f = f <= 0 ? 0 : f >= 1 ? 1 : f * f * (3 - 2 * f);
            rr = rim * f * (1 - 0.75 * band);
          }
          RM[idx] = rr;
          let r0 = fr;
          let g0 = fg;
          let b0 = fb;
          if (!flat) {
            const u = w0 * u0 + w1 * u1 + w2 * u2;
            const v = w0 * v0 + w1 * v1 + w2 * v2;
            let sx = (u * tw) | 0;
            let sy = ((1 - v) * th) | 0;
            if (sx < 0) sx = 0;
            else if (sx >= tw) sx = tw - 1;
            if (sy < 0) sy = 0;
            else if (sy >= th) sy = th - 1;
            const q = (sy * tw + sx) * 4;
            r0 = td[q];
            g0 = td[q + 1];
            b0 = td[q + 2];
          }
          if (nb) {
            const m = splat(blood, nb, w0 * P[q0] + w1 * P[q1] + w2 * P[q2], w0 * P[q0 + 1] + w1 * P[q1 + 1] + w2 * P[q2 + 1], w0 * P[q0 + 2] + w1 * P[q1 + 2] + w2 * P[q2 + 2]);
            if (m > 0) {
              r0 += (BLOOD[0] - r0) * m;
              g0 += (BLOOD[1] - g0) * m;
              b0 += (BLOOD[2] - b0) * m;
            }
          }
          CR[idx] = r0 * k * (1 - rr) + RIM_COLOUR[0] * rr;
          CG[idx] = g0 * k * (1 - rr) + RIM_COLOUR[1] * rr;
          CB[idx] = b0 * k * (1 - rr) + RIM_COLOUR[2] * rr;
        }
        w0r += e0y;
        w1r += e1y;
      }
    }
    base += it.mesh.n;
  }

  // Down to final pixels: colour = mean of the covered samples, alpha = coverage.
  const rgba = new Uint8ClampedArray(fw * fh * 4);
  const depth = new Float32Array(fw * fh).fill(-Infinity);
  const rimOut = new Uint8ClampedArray(fw * fh);
  const per = ss * ss;
  for (let fy = 0; fy < fh; fy++) {
    for (let fx = 0; fx < fw; fx++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let rm = 0;
      let c = 0;
      let dm = -Infinity;
      for (let sy = 0; sy < ss; sy++) {
        let idx = (fy * ss + sy) * W + fx * ss;
        for (let sx = 0; sx < ss; sx++, idx++) {
          const d = ZB[idx];
          if (d === -Infinity) continue;
          c++;
          r += CR[idx];
          g += CG[idx];
          b += CB[idx];
          rm += RM[idx];
          if (d > dm) dm = d;
        }
      }
      if (!c) continue;
      const q = (fy * fw + fx) * 4;
      rgba[q] = r / c;
      rgba[q + 1] = g / c;
      rgba[q + 2] = b / c;
      rgba[q + 3] = (c * 255) / per;
      depth[fy * fw + fx] = dm;
      rimOut[fy * fw + fx] = (rm / c) * 255;
    }
  }
  return { w: fw, h: fh, ox: -fx0, oy: -fy0, rgba, depth, rim: rimOut };
}

const ZERO = [0, 0, 0];
const BLOOD = [104, 14, 10];

// A splat's reach: its ragged edge goes out to EDGE times its radius, and it runs down DRIP times as far.
const EDGE = 1.22;
const DRIP = 1 / 0.3;
const NEAR = new Int32Array(64); // the splats near a triangle

/**
 * How much blood a point (a, c, h) in a part's own axes has on it, 0..0.9: the most of the splats
 * [a, c, h, r] it is in (blood[NEAR[0..n - 1]]), with a ragged edge, running down in drips.
 */
function splat(blood, n, a, c, h) {
  let m = 0;
  for (let k = 0; k < n; k++) {
    const s = blood[NEAR[k]];
    const da = a - s[0];
    const dc = c - s[1];
    let dh = h - s[2];
    const e = s[3] * EDGE;
    if (da > e || da < -e || dc > e || dc < -e || dh > e) continue;
    if (dh < 0) dh *= 0.52 - 0.22 * Math.max(0, Math.sin((a + c) * 0.17 + s[3])); // it runs, in drips
    const r = s[3] * (1 + 0.22 * Math.sin(a * 0.23 + c * 0.31) * Math.sin(h * 0.27 - c * 0.13));
    const q = (da * da + dc * dc + dh * dh) / (r * r);
    if (q < 1) {
      const v = q < 0.55 ? 0.9 : ((1 - q) / 0.45) * 0.9;
      if (v > m) m = v;
    }
  }
  return m;
}

/**
 * Which of two baked parts is nearer the camera where both cover a pixel. Each sits with its
 * origin at (x, y) px and that origin dz model units toward the camera. Returns > 0 when a is in
 * front of b over most of where they overlap, < 0 when it is behind, 0 when they don't overlap.
 */
export function overlap(a, ax, ay, adz, b, bx, by, bdz) {
  const ox0 = Math.round(ax - a.ox);
  const oy0 = Math.round(ay - a.oy);
  const ox1 = Math.round(bx - b.ox);
  const oy1 = Math.round(by - b.oy);
  const x0 = Math.max(ox0, ox1);
  const y0 = Math.max(oy0, oy1);
  const x1 = Math.min(ox0 + a.w, ox1 + b.w);
  const y1 = Math.min(oy0 + a.h, oy1 + b.h);
  let score = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const ia = (y - oy0) * a.w + (x - ox0);
      const ib = (y - oy1) * b.w + (x - ox1);
      if (a.rgba[ia * 4 + 3] < 128 || b.rgba[ib * 4 + 3] < 128) continue;
      const da = a.depth[ia] + adz;
      const db = b.depth[ib] + bdz;
      if (da > db) score++;
      else if (da < db) score--;
    }
  }
  return score;
}
