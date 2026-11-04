// Cosmetic hats. One per unit type, bought with earned coins (the Royal Crown
// comes with the cosmetic-only Supporter Pack). Pure drawing, no state.
//
//   drawHat(ctx, id, x, y, ang, size, pal, t[, f])
//     ctx   already in world space (camera applied)
//     x, y  the very top of the head, where the hat sits (the "anchor")
//     ang   the head's up direction, Math.atan2(uy, ux); upright = -PI/2
//     size  the unit's body radius R; hats are designed in units of R
//     pal   team palette { body, shade, light, dark } (the beanie is knitted in it)
//     t     seconds, for the little animations (propeller, bobble, halo, sway)
//     f     optional facing, u.f (+1 / -1). Only the lopsided hats use it (pot
//           handle, wizard tip, daisy leaf): they point backwards. Default +1.
//
// Local frame: origin at the anchor, -y = up, +x = forward when f = +1. The
// head dome is roughly a circle of radius 1 centred at (0, 0.92), and the
// googly eyes start about 0.4 below the anchor, so every brim stays above
// y = 0.22. Static shapes are Path2D objects in R units, built once on first
// use, so a hat costs a few fills and strokes and allocates nothing per frame.

export const HATS = [
  { id: 'none', name: 'No hat', price: 0, blurb: 'The classic bare bean.' },
  { id: 'party', name: 'Party Hat', price: 100, blurb: 'Every battle is a party.' },
  { id: 'beanie', name: 'Bobble Beanie', price: 120, blurb: 'Knitted in team colours. Bobble included.' },
  { id: 'flower', name: 'Daisy', price: 120, blurb: 'It grows on you.' },
  { id: 'chef', name: "Chef's Hat", price: 150, blurb: "Today's special: knuckle sandwich." },
  { id: 'propeller', name: 'Propeller Cap', price: 150, blurb: 'Does not fly. We checked.' },
  { id: 'pot', name: 'Cooking Pot', price: 160, blurb: 'Kitchen-grade armour.' },
  { id: 'cone', name: 'Traffic Cone', price: 180, blurb: 'Caution: bean at work.' },
  { id: 'tophat', name: 'Top Hat', price: 200, blurb: 'Bonk with class.' },
  { id: 'cowboy', name: 'Cowboy Hat', price: 200, blurb: 'Yee-bonk!' },
  { id: 'viking', name: 'Viking Helmet', price: 250, blurb: 'The horns are just for show.' },
  { id: 'wizard', name: 'Wizard Hat', price: 300, blurb: 'Knows one spell: BONK.' },
  { id: 'pirate', name: 'Pirate Hat', price: 300, blurb: 'Arr-med and dangerous.' },
  { id: 'halo', name: 'Halo', price: 350, blurb: 'Little angel. Big club.' },
  { id: 'crown', name: 'Crown', price: 400, blurb: 'Heavy is the bean that wears it.' },
  { id: 'goldcrown', name: 'Royal Crown', price: 0, supporter: true, blurb: 'Supporter Pack exclusive. Thank you!' },
];

const TAU = Math.PI * 2;
const OW = 0.075; // outline width (R units: about 1 px on a clubber)
const DEFAULT_PAL = { body: '#2b6be0', shade: '#1a47a6', light: '#5d97f7', dark: '#123275' };
const NO_EXTENT = { w: 0, h: 0, cx: 0, cy: 0 };
const PIVOT = 0.2; // brim line: per-hat scale factors (k) grow the hat about it

// --- geometry kit (build time only) -----------------------------------------

function arcPts(cx, cy, rx, ry, a0, a1, n = 16) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

function bez(p0, p1, p2, p3, n = 10) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = 1 - t;
    const a = m * m * m;
    const b = 3 * m * m * t;
    const c = 3 * m * t * t;
    const d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
  }
  return out;
}

function quad(p0, p1, p2, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = 1 - t;
    out.push([m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0], m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1]]);
  }
  return out;
}

/** Concatenate point runs, dropping repeated joints. */
function join(...runs) {
  const out = [];
  for (const r of runs) {
    for (const p of r) {
      const l = out[out.length - 1];
      if (!l || Math.abs(l[0] - p[0]) > 1e-6 || Math.abs(l[1] - p[1]) > 1e-6) out.push(p);
    }
  }
  const f = out[0];
  const l = out[out.length - 1];
  if (out.length > 2 && Math.abs(l[0] - f[0]) < 1e-6 && Math.abs(l[1] - f[1]) < 1e-6) out.pop(); // closed outline: drop the repeat
  return out;
}

/** Mirror a run across x = 0 and reverse it (right half -> left half). */
const mirror = (pts) => pts.map(([x, y]) => [-x, y]).reverse();
/** A left-right symmetric outline from its right half (top centre, clockwise, to bottom centre). */
const symmetric = (right) => join(right, mirror(right));
const disc = (cx, cy, r, n = 28) => arcPts(cx, cy, r, r, 0, TAU, n).slice(0, n);
const curvedBand = (y0, y1, dip, x0 = -1.6, x1 = 1.6, n = 12) =>
  join(
    Array.from({ length: n + 1 }, (_, i) => {
      const x = x0 + ((x1 - x0) * i) / n;
      return [x, y0 + dip * (1 - (x * x) / (x1 * x1))];
    }),
    Array.from({ length: n + 1 }, (_, i) => {
      const x = x1 - ((x1 - x0) * i) / n;
      return [x, y1 + dip * (1 - (x * x) / (x1 * x1))];
    }),
  );

/** Convex hull (monotone chain). */
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  const hi = [];
  for (const q of p) {
    while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop();
    lo.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 1e-12) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Sutherland-Hodgman: subject polygon clipped by the convex hull of `shape`. */
function clip(subject, shape) {
  const convex = hull(shape);
  let area = 0;
  for (let i = 0; i < convex.length; i++) {
    const a = convex[i];
    const b = convex[(i + 1) % convex.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const s = area > 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < convex.length && out.length; i++) {
    const a = convex[i];
    const b = convex[(i + 1) % convex.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    if (Math.abs(ex) + Math.abs(ey) < 1e-6) continue; // degenerate edge: its direction is noise
    const side = (p) => s * (ex * (p[1] - a[1]) - ey * (p[0] - a[0]));
    const inp = out;
    out = [];
    for (let j = 0; j < inp.length; j++) {
      const p = inp[j];
      const q = inp[(j + 1) % inp.length];
      const sp = side(p);
      const sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const k = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]);
      }
    }
  }
  return out;
}

/** Offset an open polyline by d along its normals, toward the point ref. */
function inset(pts, d, ref) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let nx = -(b[1] - a[1]);
    let ny = b[0] - a[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    if (nx * (ref[0] - p[0]) + ny * (ref[1] - p[1]) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

function toPath(pts, close = true, p = new Path2D()) {
  if (!pts || pts.length < 2) return p;
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  if (close) p.closePath();
  return p;
}

/** One Path2D holding several (drawn with a single fill or stroke). */
function merge(...paths) {
  const p = new Path2D();
  for (const q of paths) p.addPath(q);
  return p;
}

function circle(p, x, y, r) {
  p.moveTo(x + r, y);
  p.arc(x, y, r, 0, TAU);
  return p;
}

function oval(p, x, y, rx, ry, rot = 0) {
  p.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx);
  p.ellipse(x, y, rx, ry, rot, 0, TAU);
  return p;
}

/** A pompom: a union of bumps (filled with the nonzero rule, so no inner seams). e grows every bump. */
function fluff(cx, cy, r, e = 0, n = 7, p = new Path2D()) {
  circle(p, cx, cy, r * 0.74 + e);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.35;
    circle(p, cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, r * 0.42 + e);
  }
  return p;
}

/** Five-point star. */
function star(p, x, y, r, rot = -Math.PI / 2, inner = 0.45) {
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    if (i) p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else p.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  p.closePath();
  return p;
}

/** Rounded rectangle as points (corner radius r). */
function rrect(x0, y0, x1, y1, r, n = 4) {
  return join(
    arcPts(x1 - r, y0 + r, r, r, -Math.PI / 2, 0, n),
    arcPts(x1 - r, y1 - r, r, r, 0, Math.PI / 2, n),
    arcPts(x0 + r, y1 - r, r, r, Math.PI / 2, Math.PI, n),
    arcPts(x0 + r, y0 + r, r, r, Math.PI, Math.PI * 1.5, n),
  );
}

/** A capsule from a to b with radius r, as points. */
function capsule(a, b, r, n = 6) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return join(arcPts(b[0], b[1], r, r, ang - Math.PI / 2, ang + Math.PI / 2, n), arcPts(a[0], a[1], r, r, ang + Math.PI / 2, ang + Math.PI * 1.5, n));
}

/** Everything on the far side of the line a->b, as a big convex quad (for clipping shade regions). */
function halfPlane(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = (dx / l) * 9;
  const uy = (dy / l) * 9;
  // (uy, -ux) is the right-hand side of a->b on screen (y down): going down, that is +x
  return [
    [a[0] - ux, a[1] - uy],
    [b[0] + ux, b[1] + uy],
    [b[0] + ux + uy, b[1] + uy - ux],
    [a[0] - ux + uy, a[1] - uy - ux],
  ];
}

// --- draw helpers -----------------------------------------------------------

function fill(ctx, p, c) {
  ctx.fillStyle = c;
  ctx.fill(p);
}

function line(ctx, p, c, w) {
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
  ctx.stroke(p);
}

// --- the hats -----------------------------------------------------------------
// Each: sym (left-right symmetric, so its shading may follow the light),
// k (optional scale about the brim line), ext ({ w, h, cx, cy } in R: the
// measured visible box, outline included, and its centre in the local frame),
// build() -> shapes (once), draw(ctx, shapes, pal, t).

const DEFS = {
  party: {
    sym: true,
    k: 1.1,
    ext: { w: 1.17, h: 2.28, cx: 0, cy: -0.92 },
    build() {
      const apex = [0, -1.4];
      const cone = join([[-0.5, 0.11], apex, [0.5, 0.11]], quad([0.5, 0.11], [0, 0.27], [-0.5, 0.11], 8));
      const stripes = new Path2D();
      for (let k = 0; k < 4; k++) {
        const c = -1.17 + k * 0.42;
        const band = [
          [-1, c + 0.42],
          [1, c - 0.42],
          [1, c - 0.42 + 0.17],
          [-1, c + 0.42 + 0.17],
        ];
        toPath(clip(band, cone), true, stripes);
      }
      return {
        cone: toPath(cone),
        stripes,
        shade: toPath(clip(cone, halfPlane([0.03, -1.6], [0.25, 0.4]))),
        hi: toPath([[-0.07, -1.08], [-0.3, -0.12]], false),
        pomBack: fluff(0, -1.47, 0.28, OW),
        pom: fluff(0, -1.47, 0.28),
        pomLit: fluff(-0.04, -1.51, 0.28, -0.08),
      };
    },
    draw(ctx, g, pal, t) {
      fill(ctx, g.cone, '#ff5c9d');
      fill(ctx, g.stripes, '#ffd83a');
      fill(ctx, g.shade, 'rgba(120,10,70,0.22)');
      line(ctx, g.hi, 'rgba(255,255,255,0.6)', 0.09);
      line(ctx, g.cone, '#8e1f52', OW);
      const jx = 0.035 * Math.sin(t * 5.3);
      const jy = 0.02 * Math.sin(t * 8.1 + 1);
      ctx.translate(jx, jy);
      fill(ctx, g.pomBack, '#8e1f52');
      fill(ctx, g.pom, '#f6cfe0');
      fill(ctx, g.pomLit, '#fffaf3');
      ctx.translate(-jx, -jy);
    },
  },

  beanie: {
    sym: true,
    ext: { w: 1.91, h: 1.48, cx: 0, cy: -0.5 },
    build() {
      const top = (x) => -0.09 + 0.08 * (1 - (x * x) / 0.81);
      const bot = (x) => 0.13 + 0.08 * (1 - (x * x) / 0.8464);
      const xs = Array.from({ length: 13 }, (_, i) => -0.9 + (1.8 * i) / 12);
      const cuff = join(
        xs.map((x) => [x, top(x)]),
        [[0.92, 0.13]],
        xs.map((x) => [-x * (0.92 / 0.9), bot(-x * (0.92 / 0.9))]),
      );
      const dome = join(arcPts(0, -0.05, 0.86, 0.7, Math.PI, TAU, 20), [
        [0.86, 0.06],
        [-0.86, 0.06],
      ]);
      const ribs = new Path2D();
      for (let x = -0.75; x < 0.8; x += 0.1875) {
        ribs.moveTo(x, top(x) + 0.035);
        ribs.lineTo(x, bot(x) - 0.03);
      }
      // the dome's shade stops at the cuff (everything above the cuff's top edge is convex)
      const aboveCuff = join(
        Array.from({ length: 11 }, (_, i) => [-1 + i * 0.2, top(-1 + i * 0.2)]),
        [
          [1, -3],
          [-1, -3],
        ],
      );
      const cuffPath = toPath(cuff);
      return {
        cuff: cuffPath,
        ribs,
        dome: toPath(dome),
        stripe: toPath(clip(curvedBand(-0.46, -0.29, 0.06), dome)),
        shade: merge(toPath(clip(clip(dome, disc(1.12, 0.2, 0.98)), aboveCuff)), toPath(clip(cuff, halfPlane([0.52, -1], [0.52, 1])))),
        outline: merge(toPath(arcPts(0, -0.05, 0.86, 0.7, Math.PI + 0.07, TAU - 0.07, 20), false), cuffPath),
        hi: toPath(arcPts(0, -0.05, 0.64, 0.52, Math.PI * 1.13, Math.PI * 1.4, 6), false),
        bobBack: fluff(0, -0.86, 0.28, OW),
        bob: fluff(0, -0.86, 0.28),
        bobLit: fluff(-0.04, -0.9, 0.28, -0.08),
      };
    },
    draw(ctx, g, pal, t) {
      // Bobble first: the dome tucks its base in
      const jx = 0.045 * Math.sin(t * 4.6) + 0.02 * Math.sin(t * 11.3);
      const jy = 0.025 * Math.sin(t * 9.2 + 0.7);
      ctx.translate(jx, jy);
      fill(ctx, g.bobBack, pal.dark);
      fill(ctx, g.bob, '#e7dccb');
      fill(ctx, g.bobLit, '#fffaf1');
      ctx.translate(-jx, -jy);
      fill(ctx, g.dome, pal.body);
      fill(ctx, g.stripe, pal.light);
      fill(ctx, g.cuff, pal.shade);
      line(ctx, g.ribs, pal.body, 0.055);
      fill(ctx, g.shade, 'rgba(0,10,40,0.2)');
      line(ctx, g.hi, 'rgba(255,255,255,0.4)', 0.1);
      line(ctx, g.outline, pal.dark, OW);
    },
  },

  flower: {
    sym: false,
    k: 1.1,
    ext: { w: 1.27, h: 1.84, cx: 0.1, cy: -0.78 },
    build() {
      const cx = 0.06;
      const cy = -0.98;
      const stem = new Path2D();
      stem.moveTo(0, 0.05);
      stem.quadraticCurveTo(-0.24, -0.42, cx, cy);
      const leaf = join(quad([-0.1, -0.37], [0.04, -0.62], [0.36, -0.52], 6), quad([0.36, -0.52], [0.12, -0.3], [-0.1, -0.37], 6));
      const vein = toPath(quad([-0.06, -0.39], [0.1, -0.47], [0.28, -0.5], 4), false);
      const petalsUp = new Path2D();
      const petalsDn = new Path2D();
      const back = new Path2D();
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8 + 0.2;
        const px = cx + Math.cos(a) * 0.27;
        const py = cy + Math.sin(a) * 0.27;
        oval(Math.sin(a) > 0.2 ? petalsDn : petalsUp, px, py, 0.21, 0.1, a);
        oval(back, px, py, 0.21 + OW, 0.1 + OW, a);
      }
      const heart = disc(cx, cy, 0.15, 18);
      return {
        stem,
        leaf: toPath(leaf),
        vein,
        back,
        petalsUp,
        petalsDn,
        heart: toPath(heart),
        heartShade: toPath(clip(heart, disc(cx + 0.12, cy + 0.12, 0.17, 16))),
      };
    },
    draw(ctx, g, pal, t) {
      ctx.rotate(0.07 * Math.sin(t * 1.9));
      line(ctx, g.stem, '#235c1d', 0.2);
      line(ctx, g.stem, '#4fae3d', 0.11);
      fill(ctx, g.leaf, '#5fc04a');
      line(ctx, g.vein, '#3c8c30', 0.04);
      line(ctx, g.leaf, '#235c1d', OW);
      fill(ctx, g.back, '#8f88a6');
      fill(ctx, g.petalsDn, '#e6e3f0');
      fill(ctx, g.petalsUp, '#ffffff');
      fill(ctx, g.heart, '#ffc21f');
      fill(ctx, g.heartShade, '#e8950f');
      line(ctx, g.heart, '#a8650b', OW);
    },
  },

  chef: {
    sym: true,
    ext: { w: 1.79, h: 1.49, cx: 0, cy: -0.52 },
    build() {
      const puffs = [
        [-0.44, -0.5, 0.38],
        [0.44, -0.5, 0.38],
        [0, -0.72, 0.46],
        [-0.22, -0.32, 0.3],
        [0.22, -0.32, 0.3],
      ];
      const puffBack = new Path2D();
      const puff = new Path2D();
      const puffLit = new Path2D();
      for (const [x, y, r] of puffs) {
        circle(puffBack, x, y, r + OW);
        circle(puff, x, y, r);
        circle(puffLit, x - 0.045, y - 0.05, r - 0.085);
      }
      const band = join(quad([-0.58, -0.2], [0, -0.14], [0.58, -0.2], 8), [[0.62, 0.13]], quad([0.62, 0.13], [0, 0.27], [-0.62, 0.13], 8));
      const pleats = new Path2D();
      for (const x of [-0.36, -0.12, 0.12, 0.36]) {
        pleats.moveTo(x, -0.12);
        pleats.lineTo(x * 1.04, 0.12 + 0.07 * (1 - x * x));
      }
      return {
        puffBack,
        puff,
        puffLit,
        crease: toPath(arcPts(0, -0.72, 0.3, 0.26, Math.PI * 0.62, Math.PI * 0.38, 6), false),
        band: toPath(band),
        bandShade: toPath(clip(band, halfPlane([0.32, -1], [0.38, 1]))),
        pleats,
      };
    },
    draw(ctx, g) {
      fill(ctx, g.puffBack, '#8a93a6');
      fill(ctx, g.puff, '#dde1ea');
      fill(ctx, g.puffLit, '#ffffff');
      fill(ctx, g.band, '#f6f6f2');
      line(ctx, g.pleats, '#cfd4de', 0.05);
      fill(ctx, g.bandShade, 'rgba(60,70,100,0.14)');
      line(ctx, g.band, '#8a93a6', OW);
    },
  },

  propeller: {
    sym: true,
    ext: { w: 1.83, h: 1.25, cx: 0, cy: -0.39 },
    build() {
      const H = 0.72;
      const yb = 0.15;
      const domeTop = arcPts(0, yb, 0.88, H, Math.PI, TAU, 20);
      const dome = join(domeTop, quad([0.88, yb], [0, 0.27], [-0.88, yb], 8));
      // Gores: meridians x = b * sqrt(1 - ((yb - y) / H)^2), clipped by the dome
      const mer = (b, up) => {
        const pts = [];
        for (let i = 0; i <= 10; i++) {
          const k = up ? i / 10 : 1 - i / 10;
          const y = yb - H * k;
          pts.push([b * Math.sqrt(Math.max(0, 1 - k * k)), y]);
        }
        return pts;
      };
      const B = [-1.02, -0.71, -0.26, 0.26, 0.71, 1.02];
      const gores = [];
      for (let i = 0; i < 5; i++) {
        const strip = join([[B[i] * 1.05, 0.4]], mer(B[i], true), mer(B[i + 1], false), [[B[i + 1] * 1.05, 0.4]]);
        gores.push(toPath(clip(strip, dome)));
      }
      gores[0] = merge(gores[0], gores.pop()); // the two green side panels
      return {
        dome: toPath(dome),
        gores,
        shade: toPath(clip(dome, disc(1.12, 0.32, 0.92))),
        hi: toPath(arcPts(0, yb, 0.66, 0.54, Math.PI * 1.13, Math.PI * 1.4, 6), false),
        stem: toPath(
          [
            [0, -0.55],
            [0, -0.86],
          ],
          false,
        ),
        button: circle(new Path2D(), 0, -0.57, 0.09),
        hub: circle(new Path2D(), 0, -0.88, 0.085),
      };
    },
    draw(ctx, g, pal, t) {
      const C = ['#3fb85a', '#e8453c', '#ffcf33', '#3a7bea'];
      for (let i = 0; i < 4; i++) fill(ctx, g.gores[i], C[i]);
      fill(ctx, g.shade, 'rgba(10,10,40,0.2)');
      line(ctx, g.hi, 'rgba(255,255,255,0.45)', 0.1);
      line(ctx, g.dome, '#2c2f3a', OW);
      line(ctx, g.stem, '#2c2f3a', 0.1);
      fill(ctx, g.button, '#2c2f3a');
      // Two blades spinning about the stem, seen from the side
      const c = Math.cos(t * 15);
      const half = 0.42 * Math.abs(c) + 0.045;
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = '#4a2418';
      for (let k = 0; k < 2; k++) {
        const s = k ? -c : c;
        ctx.beginPath();
        ctx.ellipse(s * 0.42, -0.89, half, 0.085, 0, 0, TAU);
        ctx.fillStyle = k ? '#ffcf33' : '#e8453c';
        ctx.fill();
        ctx.stroke();
      }
      fill(ctx, g.hub, '#ffcf33');
      line(ctx, g.hub, '#4a2418', 0.05);
    },
  },

  pot: {
    sym: false,
    ext: { w: 2.96, h: 0.98, cx: -0.4, cy: -0.25 },
    build() {
      const body = rrect(-0.84, -0.64, 0.84, 0.12, 0.2);
      const lip = join(
        [
          [-0.97, 0.02],
          [0.97, 0.02],
        ],
        arcPts(0.97, 0.095, 0.075, 0.075, -Math.PI / 2, Math.PI / 2, 4),
        quad([0.97, 0.17], [0, 0.25], [-0.97, 0.17], 8),
        arcPts(-0.97, 0.095, 0.075, 0.075, Math.PI / 2, Math.PI * 1.5, 4),
      );
      const handle = toPath(capsule([-0.72, -0.22], [-1.74, -0.6], 0.1, 6));
      circle(handle, -1.61, -0.553, 0.045);
      const r = 0.2;
      const bodyLine = join([[-0.84, 0.03]], arcPts(-0.84 + r, -0.64 + r, r, r, Math.PI, Math.PI * 1.5, 4), arcPts(0.84 - r, -0.64 + r, r, r, -Math.PI / 2, 0, 4), [[0.84, 0.03]]);
      const hi = new Path2D();
      hi.moveTo(-0.58, -0.48);
      hi.lineTo(-0.58, -0.04);
      hi.moveTo(-0.4, -0.48);
      hi.lineTo(-0.4, -0.28);
      const lipPath = toPath(lip);
      return {
        body: toPath(body),
        hi,
        seam: toPath(quad([-0.82, -0.46], [0, -0.42], [0.82, -0.46], 6), false),
        lip: lipPath,
        shade: merge(toPath(clip(clip(body, halfPlane([0.48, -1], [0.48, 1])), halfPlane([-1, 0.02], [1, 0.02]))), toPath(clip(lip, halfPlane([0.5, -1], [0.5, 1])))),
        outline: merge(toPath(bodyLine, false), lipPath),
        handle,
        handleHi: toPath(
          [
            [-0.92, -0.36],
            [-1.5, -0.58],
          ],
          false,
        ),
        bracket: toPath(capsule([-0.7, -0.21], [-0.97, -0.31], 0.08, 4)),
      };
    },
    draw(ctx, g) {
      ctx.fillStyle = '#3b3e48';
      ctx.fill(g.handle, 'evenodd');
      line(ctx, g.handleHi, '#6b7080', 0.05);
      line(ctx, g.handle, '#1c1d23', OW);
      fill(ctx, g.bracket, '#9aa3b0');
      line(ctx, g.bracket, '#4f5a68', OW * 0.8);
      fill(ctx, g.body, '#c3cad4');
      line(ctx, g.seam, 'rgba(80,92,110,0.35)', 0.05);
      line(ctx, g.hi, 'rgba(255,255,255,0.72)', 0.08);
      fill(ctx, g.lip, '#d9dee6');
      fill(ctx, g.shade, 'rgba(40,55,80,0.22)');
      line(ctx, g.outline, '#596472', OW);
    },
  },

  cone: {
    sym: true,
    k: 1.05,
    ext: { w: 1.83, h: 1.64, cx: 0, cy: -0.6 },
    build() {
      const cone = join([[-0.56, 0.08]], arcPts(0, -1.18, 0.12, 0.12, Math.PI, TAU, 8), [[0.56, 0.08]]);
      const bands = new Path2D();
      toPath(clip(curvedBand(-0.9, -0.72, 0.05), cone), true, bands);
      toPath(clip(curvedBand(-0.47, -0.28, 0.06), cone), true, bands);
      const base = rrect(-0.84, 0.02, 0.84, 0.19, 0.05, 3);
      const basePath = toPath(base);
      return {
        cone: toPath(cone),
        bands,
        shade: merge(toPath(clip(clip(cone, halfPlane([0.03, -1.4], [0.26, 0.3])), halfPlane([-1, 0.02], [1, 0.02]))), toPath(clip(base, halfPlane([0.5, -1], [0.5, 1])))),
        outline: merge(toPath(cone, false), basePath),
        hi: toPath(
          [
            [-0.1, -1.04],
            [-0.36, -0.06],
          ],
          false,
        ),
        base: basePath,
      };
    },
    draw(ctx, g) {
      fill(ctx, g.cone, '#ff7d1e');
      fill(ctx, g.bands, '#f7f5ef');
      fill(ctx, g.base, '#e2600d');
      fill(ctx, g.shade, 'rgba(130,35,0,0.25)');
      line(ctx, g.hi, 'rgba(255,255,255,0.55)', 0.09);
      line(ctx, g.outline, '#9b3c06', OW);
    },
  },

  tophat: {
    sym: true,
    ext: { w: 2.05, h: 1.37, cx: 0, cy: -0.43 },
    build() {
      const crown = join([[-0.52, 0.1]], arcPts(0, -0.98, 0.58, 0.1, Math.PI, TAU, 12), [[0.52, 0.1]]);
      const brim = symmetric(
        join(
          [[0, 0.11]],
          bez([0.5, 0.11], [0.8, 0.11], [0.92, 0.07], [0.99, -0.02], 6),
          bez([0.99, -0.02], [1.0, 0.1], [0.86, 0.22], [0.5, 0.22], 6),
          [[0, 0.22]],
        ),
      );
      const top = oval(new Path2D(), 0, -0.98, 0.58, 0.1);
      const brimPath = toPath(brim);
      return {
        crown: toPath(crown),
        band: toPath(clip(curvedBand(-0.2, 0.06, 0.03), crown)),
        top,
        shade: merge(toPath(clip(clip(crown, halfPlane([0.26, -1.2], [0.24, 0.4])), halfPlane([-1, 0.08], [1, 0.08]))), toPath(clip(brim, halfPlane([0.55, -1], [0.55, 1])))),
        outline: merge(toPath(crown, false), top, brimPath),
        hi: toPath(
          [
            [-0.36, -0.86],
            [-0.33, -0.28],
          ],
          false,
        ),
        brim: brimPath,
      };
    },
    draw(ctx, g) {
      fill(ctx, g.crown, '#2e2b36');
      fill(ctx, g.band, '#d23a55');
      fill(ctx, g.top, '#4a4657');
      fill(ctx, g.brim, '#38343f');
      fill(ctx, g.shade, 'rgba(0,0,0,0.3)');
      line(ctx, g.hi, 'rgba(255,255,255,0.22)', 0.1);
      line(ctx, g.outline, '#111015', OW);
    },
  },

  cowboy: {
    sym: true,
    ext: { w: 2.71, h: 1.1, cx: 0, cy: -0.29 },
    build() {
      const side = join(bez([0, -0.68], [0.18, -0.82], [0.38, -0.84], [0.46, -0.72], 8), bez([0.46, -0.72], [0.58, -0.56], [0.6, -0.2], [0.56, 0.1], 8));
      const crown = symmetric(join(side, [[0, 0.1]]));
      const brim = symmetric(
        join(
          [[0, 0.08]],
          bez([0, 0.08], [0.85, 0.08], [1.2, -0.02], [1.32, -0.24], 10),
          bez([1.32, -0.24], [1.34, 0.0], [0.9, 0.23], [0, 0.23], 10),
        ),
      );
      const brimPath = toPath(brim);
      return {
        crown: toPath(crown),
        band: toPath(clip(curvedBand(-0.12, 0.08, 0.02), crown)),
        crease: toPath(bez([0, -0.68], [0.02, -0.5], [-0.02, -0.38], [0, -0.3], 5), false),
        shade: merge(toPath(clip(clip(crown, halfPlane([0.28, -1.2], [0.26, 0.4])), halfPlane([-1, 0.07], [1, 0.07]))), toPath(clip(brim, halfPlane([0.62, -1], [0.66, 1])))),
        hi: merge(toPath(bez([-0.38, -0.66], [-0.46, -0.5], [-0.46, -0.3], [-0.42, -0.16], 5), false), toPath(bez([-1.26, -0.18], [-1.1, 0.02], [-0.8, 0.1], [-0.55, 0.11], 6), false)),
        brim: brimPath,
        outline: merge(toPath(join(mirror(side), side), false), brimPath),
      };
    },
    draw(ctx, g) {
      fill(ctx, g.crown, '#c98c4c');
      fill(ctx, g.band, '#5a3415');
      line(ctx, g.crease, 'rgba(90,52,21,0.6)', 0.06);
      fill(ctx, g.brim, '#bf8243');
      fill(ctx, g.shade, 'rgba(80,40,0,0.25)');
      line(ctx, g.hi, 'rgba(255,230,190,0.55)', 0.08);
      line(ctx, g.outline, '#5a3415', OW);
    },
  },

  viking: {
    sym: true,
    ext: { w: 2.69, h: 1.26, cx: 0, cy: -0.39 },
    build() {
      const horn = join(bez([0.62, 0.0], [1.2, -0.04], [1.42, -0.5], [1.26, -0.98], 10), bez([1.26, -0.98], [1.14, -0.6], [0.98, -0.34], [0.6, -0.3], 10));
      const rings = new Path2D();
      for (const [a, b] of [
        [
          [0.98, -0.07],
          [0.92, -0.34],
        ],
        [
          [1.22, -0.3],
          [1.07, -0.5],
        ],
      ]) {
        rings.moveTo(a[0], a[1]);
        rings.lineTo(b[0], b[1]);
        rings.moveTo(-a[0], a[1]);
        rings.lineTo(-b[0], b[1]);
      }
      const horns = toPath(horn);
      toPath(mirror(horn), true, horns);
      const dome = join(arcPts(0, 0.14, 0.8, 0.72, Math.PI, TAU, 20), quad([0.8, 0.14], [0, 0.28], [-0.8, 0.14], 8));
      const rivets = new Path2D();
      for (const x of [-0.56, -0.2, 0.2, 0.56]) circle(rivets, x, 0.12 + 0.05 * (1 - x * x), 0.045);
      return {
        horns,
        hornShade: toPath(clip(horn, disc(0.68, -0.72, 0.62))),
        rings,
        dome: toPath(dome),
        bronze: merge(toPath(clip(curvedBand(-0.03, 0.4, 0.06), dome)), toPath(clip(halfPlane([0.09, 1], [0.09, -1]), clip(dome, halfPlane([-0.09, -1], [-0.09, 1]))))),
        shade: toPath(clip(dome, disc(1.02, 0.28, 0.86))),
        hi: toPath(arcPts(0, 0.14, 0.6, 0.54, Math.PI * 1.13, Math.PI * 1.38, 6), false),
        rivets,
      };
    },
    draw(ctx, g) {
      fill(ctx, g.horns, '#f4e8c6');
      fill(ctx, g.hornShade, 'rgba(150,110,40,0.28)');
      line(ctx, g.rings, '#c2a56c', 0.06);
      line(ctx, g.horns, '#8c7448', OW);
      fill(ctx, g.dome, '#b6bfca');
      fill(ctx, g.bronze, '#d79c3d');
      fill(ctx, g.shade, 'rgba(20,30,50,0.22)');
      line(ctx, g.hi, 'rgba(255,255,255,0.65)', 0.1);
      fill(ctx, g.rivets, '#fbe3a0');
      line(ctx, g.dome, '#4f5a68', OW);
    },
  },

  wizard: {
    sym: false,
    ext: { w: 2.11, h: 1.89, cx: 0, cy: -0.69 },
    build() {
      // Static lower part (for the band, stars and shade); the floppy tip is drawn live
      const lower = join(bez([-0.56, 0.1], [-0.46, -0.32], [-0.36, -0.76], [-0.3, -1.04], 10), [[0.38, -1.04]], bez([0.38, -0.8], [0.44, -0.42], [0.5, -0.12], [0.56, 0.1], 8));
      const stars = new Path2D();
      star(stars, 0.06, -0.6, 0.15, -1.2);
      star(stars, -0.1, -1.04, 0.1, -1.5);
      star(stars, 0.28, -0.3, 0.09, -1.8);
      toPath(join(arcPts(-0.24, -0.36, 0.12, 0.12, -1.9, 1.9, 8).reverse(), arcPts(-0.19, -0.38, 0.1, 0.1, 1.75, -1.75, 8)), true, stars); // moon
      const brim = arcPts(0, 0.13, 1.02, 0.09, 0, TAU, 24);
      return {
        band: toPath(clip(curvedBand(-0.2, -0.03, 0.04), lower)),
        stars,
        shade: toPath(clip(lower, halfPlane([0.04, -1.4], [0.27, 0.3]))),
        brim: toPath(brim),
        brimShade: toPath(clip(brim, halfPlane([0.55, -1], [0.6, 1]))),
        brimHi: toPath(arcPts(0, 0.13, 0.86, 0.05, Math.PI * 1.1, Math.PI * 1.4, 5), false),
        tipStar: star(new Path2D(), 0, 0, 0.13),
      };
    },
    draw(ctx, g, pal, t) {
      const s = 0.05 * Math.sin(t * 1.7);
      const tx = -0.84;
      const ty = -1.1 + s;
      ctx.beginPath();
      ctx.moveTo(-0.56, 0.1);
      ctx.bezierCurveTo(-0.46, -0.32, -0.36, -0.76, -0.3, -1.04);
      ctx.bezierCurveTo(-0.44, -1.06 + s * 0.4, -0.62, -1.04 + s, tx, ty);
      ctx.bezierCurveTo(-0.76, -1.32 + s, -0.46, -1.62, -0.12, -1.6);
      ctx.bezierCurveTo(0.12, -1.57, 0.32, -1.22, 0.38, -0.8);
      ctx.bezierCurveTo(0.44, -0.42, 0.5, -0.12, 0.56, 0.1);
      ctx.closePath();
      ctx.fillStyle = '#5b40c2';
      ctx.fill();
      fill(ctx, g.band, '#ffd04a');
      fill(ctx, g.stars, '#ffe36b');
      fill(ctx, g.shade, 'rgba(20,0,60,0.25)');
      ctx.strokeStyle = '#23175c';
      ctx.lineWidth = OW;
      ctx.stroke();
      ctx.translate(tx, ty);
      fill(ctx, g.tipStar, '#ffd04a');
      line(ctx, g.tipStar, '#8a5a0a', 0.05);
      ctx.translate(-tx, -ty);
      fill(ctx, g.brim, '#5b40c2');
      fill(ctx, g.brimShade, 'rgba(20,0,60,0.25)');
      line(ctx, g.brimHi, 'rgba(255,255,255,0.3)', 0.06);
      line(ctx, g.brim, '#23175c', OW);
    },
  },

  pirate: {
    sym: true,
    k: 1.05,
    ext: { w: 2.51, h: 1.27, cx: 0, cy: -0.41 },
    build() {
      const topRight = join(bez([0, -0.94], [0.36, -0.94], [0.48, -0.78], [0.56, -0.62], 8), bez([0.56, -0.62], [0.68, -0.44], [0.9, -0.34], [1.16, -0.33], 8));
      const hat = symmetric(join(topRight, bez([1.16, -0.33], [0.88, 0.12], [0.46, 0.2], [0, 0.2], 10)));
      const topEdge = join(mirror(topRight), topRight);
      const trim = inset(topEdge.slice(1, -1), 0.09, [0, -0.2]);
      const bones = new Path2D();
      bones.moveTo(-0.27, -0.2);
      bones.lineTo(0.27, -0.6);
      bones.moveTo(-0.27, -0.6);
      bones.lineTo(0.27, -0.2);
      const knobs = new Path2D();
      for (const [x, y] of [
        [-0.27, -0.2],
        [0.27, -0.6],
        [-0.27, -0.6],
        [0.27, -0.2],
      ]) {
        circle(knobs, x + Math.sign(x) * 0.02, y - 0.035, 0.045);
        circle(knobs, x - Math.sign(x) * 0.02, y + 0.035, 0.045);
      }
      const skull = knobs; // bone ends and skull share one fill
      circle(skull, 0, -0.45, 0.19);
      toPath(rrect(-0.11, -0.38, 0.11, -0.25, 0.04, 2), true, skull);
      const face = new Path2D();
      circle(face, -0.075, -0.44, 0.055);
      circle(face, 0.075, -0.44, 0.055);
      toPath(
        [
          [0, -0.38],
          [-0.03, -0.33],
          [0.03, -0.33],
        ],
        true,
        face,
      );
      return {
        hat: toPath(hat),
        trim: toPath(trim, false),
        shade: toPath(clip(hat, disc(1.25, 0.5, 0.95))),
        hi: toPath(bez([-0.36, -0.82], [-0.5, -0.7], [-0.62, -0.52], [-0.8, -0.42], 6), false),
        bones,
        skull,
        face,
      };
    },
    draw(ctx, g) {
      fill(ctx, g.hat, '#2c2732');
      fill(ctx, g.shade, 'rgba(0,0,0,0.3)');
      line(ctx, g.hi, 'rgba(255,255,255,0.2)', 0.09);
      line(ctx, g.trim, '#e8b931', 0.08);
      line(ctx, g.hat, '#0f0c12', OW);
      line(ctx, g.bones, '#f4f1e8', 0.08);
      fill(ctx, g.skull, '#f4f1e8');
      fill(ctx, g.face, '#2c2732');
    },
  },

  halo: {
    sym: true,
    ext: { w: 1.75, h: 0.79, cx: 0, cy: -0.65 },
    build() {
      return {
        ring: oval(new Path2D(), 0, -0.66, 0.7, 0.19),
        hi: merge(toPath(arcPts(0, -0.66, 0.7, 0.19, Math.PI * 1.05, Math.PI * 1.45, 6), false), toPath(arcPts(0, -0.66, 0.7, 0.19, Math.PI * 0.3, Math.PI * 0.55, 4), false)),
      };
    },
    draw(ctx, g, pal, t) {
      const b = 0.05 * Math.sin(t * 2.6);
      ctx.translate(0, b);
      line(ctx, g.ring, 'rgba(255,236,140,0.3)', 0.36);
      line(ctx, g.ring, '#c48a10', 0.21);
      line(ctx, g.ring, '#ffd84a', 0.13);
      line(ctx, g.hi, '#fff8d6', 0.055);
      ctx.translate(0, -b);
    },
  },

  crown: {
    sym: true,
    k: 1.12,
    ext: { w: 1.89, h: 1.25, cx: 0, cy: -0.39 },
    build() {
      const xs = [-0.74, -0.37, 0, 0.37, 0.74];
      const ys = [-0.52, -0.62, -0.74, -0.62, -0.52];
      const top = [];
      for (let i = 0; i < 5; i++) {
        top.push([xs[i], ys[i]]);
        if (i < 4) {
          const vx = (xs[i] + xs[i + 1]) / 2;
          top.push(...quad([xs[i], ys[i]], [vx, -0.12], [xs[i + 1], ys[i + 1]], 6).slice(1, -1));
        }
      }
      const crown = join([[-0.7, 0.14]], top, [[0.7, 0.14]], quad([0.7, 0.14], [0, 0.27], [-0.7, 0.14], 8));
      const balls = new Path2D();
      for (let i = 0; i < 5; i++) circle(balls, xs[i], ys[i] - 0.03, 0.075);
      const gems = new Path2D();
      oval(gems, -0.42, 0.04, 0.085, 0.07);
      oval(gems, 0.42, 0.04, 0.085, 0.07);
      const ruby = oval(new Path2D(), 0, 0.05, 0.12, 0.085);
      const crownPath = toPath(crown);
      return {
        crown: crownPath,
        outline: merge(crownPath, balls),
        gemLine: merge(ruby, gems),
        band: toPath(clip(clip(crown, halfPlane([1, -0.11], [-1, -0.11])), halfPlane([-1, -0.04], [1, -0.04]))),
        shade: toPath(clip(crown, halfPlane([0.36, -1], [0.4, 1]))),
        hi: toPath(
          [
            [-0.5, -0.36],
            [-0.5, 0.08],
          ],
          false,
        ),
        balls,
        ruby,
        gems,
        glint: circle(new Path2D(), -0.035, 0.02, 0.03),
      };
    },
    draw(ctx, g) {
      fill(ctx, g.crown, '#f6c63a');
      fill(ctx, g.band, '#e2a923');
      fill(ctx, g.shade, 'rgba(140,80,0,0.25)');
      line(ctx, g.hi, 'rgba(255,250,200,0.75)', 0.08);
      fill(ctx, g.balls, '#fff0a0');
      line(ctx, g.outline, '#8a5a0a', OW);
      fill(ctx, g.ruby, '#e0213f');
      fill(ctx, g.gems, '#2f6fe8');
      line(ctx, g.gemLine, '#2a1238', 0.05);
      fill(ctx, g.glint, '#ffffff');
    },
  },

  goldcrown: {
    sym: true,
    k: 1.16,
    ext: { w: 2.21, h: 1.98, cx: 0, cy: -0.71 },
    build() {
      const cap = join(arcPts(0, -0.02, 0.66, 0.8, Math.PI, TAU, 18), [
        [0.66, 0.05],
        [-0.66, 0.05],
      ]);
      const arches = new Path2D();
      arches.moveTo(-0.62, -0.1);
      arches.bezierCurveTo(-0.66, -0.66, -0.36, -0.9, 0, -0.9);
      arches.bezierCurveTo(0.36, -0.9, 0.66, -0.66, 0.62, -0.1);
      arches.moveTo(0, -0.12);
      arches.lineTo(0, -0.9);
      const pearls = new Path2D();
      for (const [x, y] of [
        [-0.58, -0.44],
        [-0.42, -0.74],
        [0.42, -0.74],
        [0.58, -0.44],
        [0, -0.38],
        [0, -0.62],
      ])
        circle(pearls, x, y, 0.045);
      const circlet = join(quad([-0.76, -0.17], [0, -0.1], [0.76, -0.17], 8), [[0.78, 0.03]], quad([0.78, 0.03], [0, 0.12], [-0.78, 0.03], 8));
      const points = new Path2D();
      for (const x of [-0.36, 0.36]) {
        toPath(
          [
            [x - 0.1, -0.14],
            [x - 0.05, -0.3],
            [x - 0.1, -0.4],
            [x, -0.36],
            [x + 0.1, -0.4],
            [x + 0.05, -0.3],
            [x + 0.1, -0.14],
          ],
          true,
          points,
        );
      }
      const ermine = join(quad([-0.82, -0.01], [0, 0.07], [0.82, -0.01], 8), arcPts(0.82, 0.09, 0.1, 0.1, -Math.PI / 2, Math.PI / 2, 4), quad([0.82, 0.19], [0, 0.29], [-0.82, 0.19], 8), arcPts(-0.82, 0.09, 0.1, 0.1, Math.PI / 2, Math.PI * 1.5, 4));
      const spots = new Path2D();
      for (const x of [-0.56, -0.18, 0.2, 0.58]) {
        const y = 0.11 + 0.05 * (1 - x * x);
        toPath(
          [
            [x, y - 0.07],
            [x + 0.035, y + 0.03],
            [x, y + 0.05],
            [x - 0.035, y + 0.03],
          ],
          true,
          spots,
        );
      }
      const cross = new Path2D();
      cross.moveTo(0, -1.08);
      cross.lineTo(0, -1.36);
      cross.moveTo(-0.09, -1.26);
      cross.lineTo(0.09, -1.26);
      const orb = circle(new Path2D(), 0, -0.98, 0.13);
      const circletPath = toPath(circlet);
      const sparkle = new Path2D();
      sparkle.moveTo(0, -1);
      sparkle.quadraticCurveTo(0.08, -0.08, 1, 0);
      sparkle.quadraticCurveTo(0.08, 0.08, 0, 1);
      sparkle.quadraticCurveTo(-0.08, 0.08, -1, 0);
      sparkle.quadraticCurveTo(-0.08, -0.08, 0, -1);
      return {
        cap: toPath(cap),
        capShade: toPath(clip(cap, disc(0.9, 0.0, 0.72))),
        capHi: toPath(arcPts(0, -0.02, 0.48, 0.6, Math.PI * 1.15, Math.PI * 1.38, 5), false),
        arches: merge(arches, cross),
        pearls,
        gold: merge(points, orb, circletPath),
        circletShade: toPath(clip(circlet, halfPlane([0.45, -1], [0.45, 1]))),
        ruby: oval(new Path2D(), 0, -0.04, 0.13, 0.095),
        gems: oval(oval(new Path2D(), -0.52, -0.05, 0.08, 0.065), 0.52, -0.05, 0.08, 0.065),
        emeralds: oval(oval(new Path2D(), -0.25, -0.03, 0.06, 0.05), 0.25, -0.03, 0.06, 0.05),
        ermine: toPath(ermine),
        ermineShade: toPath(clip(ermine, halfPlane([0.52, -1], [0.56, 1]))),
        spots,
        sparkle,
      };
    },
    draw(ctx, g, pal, t) {
      const GOLD = '#f7c83c';
      const EDGE = '#8a5a0a';
      fill(ctx, g.cap, '#c01f45');
      fill(ctx, g.capShade, 'rgba(60,0,20,0.3)');
      line(ctx, g.capHi, 'rgba(255,190,210,0.5)', 0.09);
      line(ctx, g.cap, '#5c0b20', OW);
      line(ctx, g.arches, EDGE, 0.19);
      line(ctx, g.arches, GOLD, 0.11);
      fill(ctx, g.pearls, '#fffbea');
      fill(ctx, g.gold, GOLD);
      fill(ctx, g.circletShade, 'rgba(140,80,0,0.25)');
      line(ctx, g.gold, EDGE, OW);
      fill(ctx, g.ruby, '#e0213f');
      fill(ctx, g.gems, '#2f6fe8');
      fill(ctx, g.emeralds, '#1fb86a');
      fill(ctx, g.ermine, '#fbf8f0');
      fill(ctx, g.ermineShade, 'rgba(90,80,70,0.18)');
      fill(ctx, g.spots, '#24222b');
      line(ctx, g.ermine, '#9b9284', OW);
      // A twinkle that hops between the orb, the ruby and an arch
      const p = t * 0.9;
      const i = Math.floor(p) % 3;
      const k = Math.sin((p - Math.floor(p)) * Math.PI);
      if (k > 0.05) {
        const sx = i === 0 ? 0.13 : i === 1 ? -0.1 : 0.5;
        const sy = i === 0 ? -1.08 : i === 1 ? -0.1 : -0.72;
        const r = 0.24 * k * k;
        ctx.translate(sx, sy);
        ctx.scale(r, r);
        fill(ctx, g.sparkle, '#ffffff');
        ctx.scale(1 / r, 1 / r);
        ctx.translate(-sx, -sy);
      }
    },
  },
};

/** Draw hat `id` sitting on the anchor (x, y). See the top of the file. Never throws. */
export function drawHat(ctx, id, x, y, ang, size, pal, t, f = 1) {
  const def = DEFS[id];
  if (!def || !ctx) return;
  if (!(size > 0) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(ang) || !Number.isFinite(size)) return;
  let saved = false;
  try {
    if (!def.g) {
      if (typeof Path2D === 'undefined') return;
      def.g = def.build();
    }
    ctx.save();
    saved = true;
    // Symmetric hats mirror so their lit side faces the light (upper left), like the bodies do;
    // lopsided ones follow the facing instead.
    const sa = Math.sin(ang);
    const ca = Math.cos(ang);
    let mx = 1;
    if (def.sym) {
      if (0.6 * sa - 0.8 * ca > 0) mx = -1;
    } else if (f < 0) mx = -1;
    // translate(x, y) . rotate(ang + PI/2) . scale(size * mx, size), then the hat's own
    // scale k about the brim line (a bigger hat never slides down over the eyes), in one call
    const k = def.k || 1;
    const sk = size * k;
    const d = PIVOT * (1 - k) * size;
    ctx.transform(-sa * sk * mx, ca * sk * mx, -ca * sk, -sa * sk, x - ca * d, y - sa * d);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 1;
    def.draw(ctx, def.g, pal || DEFAULT_PAL, Number.isFinite(t) ? t : 0);
  } catch (e) {
    // a cosmetic must never break a frame
  } finally {
    if (saved) {
      try {
        ctx.restore();
      } catch (e) {
        /* ignore */
      }
    }
  }
}

// How far above the shape's base particle (head; chest for the ball) a hat sits, in R.
// The spiker's apex is rounded off by its arcTo, so its visible tip is only ~0.6R above
// the head: 1.0 left a gap, 0.45 lets the point poke just inside the brim.
const SEAT = { bean: 0.92, brick: 0.95, triangle: 0.45, ball: 1.0 };

/**
 * Optional helper: where a unit's hat goes -> out = { x, y, ang } (ang for drawHat).
 * Follows the body's squash & stretch (the same matrix as applySquash in
 * units.js), but never slides more than 0.2R down the spine: the googly eyes
 * do not squash, and the brim must stay above them.
 */
export function hatAnchor(u, out = {}) {
  const shape = (u.type && u.type.shape) || 'bean';
  const base = shape === 'ball' ? u.chest : u.head;
  const R = u.R;
  const k = (SEAT[shape] ?? SEAT.bean) * R;
  const ux = u.ux;
  const uy = u.uy;
  let x = base.x + ux * k;
  let y = base.y + uy * k;
  const sq = u.sq || 0;
  if (Math.abs(sq) > 0.004 && u.hip) {
    const a = 1 - sq * 0.85; // along the spine
    const b = 1 + sq; // across
    const dx = x - u.hip.x;
    const dy = y - u.hip.y;
    const m12 = ux * uy * (a - b);
    let sx = u.hip.x + (ux * ux * a + uy * uy * b) * dx + m12 * dy;
    let sy = u.hip.y + m12 * dx + (uy * uy * a + ux * ux * b) * dy;
    const down = (x - sx) * ux + (y - sy) * uy; // how far the squash pulled it down the spine
    if (down > 0.2 * R) {
      sx += ux * (down - 0.2 * R);
      sy += uy * (down - 0.2 * R);
    }
    x = sx;
    y = sy;
  }
  out.x = x;
  out.y = y;
  out.ang = Math.atan2(uy, ux);
  return out;
}

/**
 * Rough size of a hat in units of R: { w, h, cx, cy }. w and h are the width
 * and height of its visible box; (cx, cy) is the box centre in the hat's local
 * frame (cy < 0 = above the anchor; cx is only non-zero for the lopsided pot
 * and daisy, and flips sign with f). A loose hat whose box centre is C, lying
 * so that its up is (ux, uy), draws at anchor
 *   x = C.x + (ux * cy + uy * cx * f) * R,  y = C.y + (uy * cy - ux * cx * f) * R.
 * Unknown ids (and 'none') give all zeros.
 */
export function hatExtent(id) {
  const def = DEFS[id];
  return def ? { w: def.ext.w, h: def.ext.h, cx: def.ext.cx, cy: def.ext.cy } : { ...NO_EXTENT };
}
