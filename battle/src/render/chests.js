// The two menu chests: the Small Chest (wood with iron bands) and the Big Chest
// (bigger, darker wood, gold trim and a gem lock), storybook style, with the
// opening animation: shake, the lid popping up and back, light pouring out.
//
//   drawChest(canvas, 'small', { t, open: 0..1, shake: 0..1, glow: 0..1, ready });
//
// The canvas is cleared and filled (device px; any size, the chest is fitted
// to its shorter side). t = seconds (wobble, rays, sparkles). ready = the
// chest can be opened: it hops now and then and sparkles. The static wood,
// bands and lid are painted once per kind and size into offscreen canvases.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d) => (Number.isFinite(v) ? v : d);
const INK = '#2a1d14';

export const CHEST_KINDS = ['small', 'big'];

// Design box 100 x 100 units; base = the line the chest stands on.
const KINDS = {
  small: {
    w: 60, bodyH: 28, lidH: 19, base: 84, band: 6,
    wood: { base: '#b5733d', dark: '#86501f', light: '#d39553', line: '#6e4019' },
    trim: { base: '#5a5d68', dark: '#34363e', light: '#9aa0ad', rivet: '#d3d8e1' },
    inside: '#3a2414',
  },
  big: {
    w: 82, bodyH: 36, lidH: 26, base: 87, band: 7,
    wood: { base: '#9b4a2a', dark: '#6e2e16', light: '#c56c40', line: '#57220f' },
    trim: { base: '#f2c14e', dark: '#b07a1c', light: '#fff1b0', rivet: '#fff8d8' },
    inside: '#2e1610',
    gem: { base: '#43b4ff', dark: '#1b5fb8', light: '#d6f2ff' },
  },
};

const caches = new Map(); // `${kind}|${W}x${H}` -> { body, lid, under }

function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Arched lid outline: a flat bottom at y0 and a rounded top lidH above it. */
function lidPath(g, x0, x1, y0, h) {
  const cx = (x0 + x1) / 2;
  const hw = (x1 - x0) / 2;
  g.moveTo(x0, y0);
  g.lineTo(x0, y0 - h * 0.42);
  g.ellipse(cx, y0 - h * 0.42, hw, h * 0.58, 0, Math.PI, TAU);
  g.lineTo(x1, y0);
  g.closePath();
}

function rivets(g, xs, ys, r, col) {
  g.fillStyle = col;
  g.beginPath();
  for (const x of xs) for (const y of ys) {
    g.moveTo(x + r, y);
    g.arc(x, y, r, 0, TAU);
  }
  g.fill();
}

function paintBody(g, K) {
  const { w, bodyH, base, band } = K;
  const x0 = 50 - w / 2;
  const x1 = 50 + w / 2;
  const y0 = base - bodyH;
  const W = K.wood;
  const T = K.trim;
  // Outline, then wood planks lit from the upper left
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, x0 - 1.6, y0 - 1.6, w + 3.2, bodyH + 3.2, 4.5);
  g.fill();
  g.save();
  g.beginPath();
  rrect(g, x0, y0, w, bodyH, 3.5);
  g.clip();
  const planks = K === KINDS.big ? 4 : 3;
  for (let i = 0; i < planks; i++) {
    const py = y0 + (i * bodyH) / planks;
    const ph = bodyH / planks;
    const gr = g.createLinearGradient(x0, py, x1, py + ph);
    gr.addColorStop(0, i % 2 ? W.base : W.light);
    gr.addColorStop(1, i % 2 ? W.dark : W.base);
    g.fillStyle = gr;
    g.fillRect(x0, py, w, ph);
    g.fillStyle = W.line;
    g.fillRect(x0, py + ph - 0.9, w, 0.9);
    // grain
    g.strokeStyle = 'rgba(70,35,12,0.25)';
    g.lineWidth = 0.6;
    g.beginPath();
    g.moveTo(x0 + 6 + i * 7, py + ph * 0.45);
    g.quadraticCurveTo(x0 + 18 + i * 5, py + ph * 0.3, x0 + 30 + i * 3, py + ph * 0.5);
    g.moveTo(x1 - 26 + i * 4, py + ph * 0.6);
    g.quadraticCurveTo(x1 - 16, py + ph * 0.75, x1 - 6, py + ph * 0.55);
    g.stroke();
  }
  // Shade toward the bottom and the right
  const sh = g.createLinearGradient(x0, 0, x1, 0);
  sh.addColorStop(0, 'rgba(255,240,210,0.12)');
  sh.addColorStop(0.6, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(40,16,4,0.25)');
  g.fillStyle = sh;
  g.fillRect(x0, y0, w, bodyH);
  g.restore();
  // Bands: two uprights, a bottom strip and corner caps
  const bands = [x0 + w * 0.2, x1 - w * 0.2];
  for (const bx of bands) {
    g.fillStyle = INK;
    g.fillRect(bx - band / 2 - 0.8, y0, band + 1.6, bodyH);
    g.fillStyle = T.base;
    g.fillRect(bx - band / 2, y0, band, bodyH);
    g.fillStyle = T.light;
    g.fillRect(bx - band / 2, y0, band * 0.3, bodyH);
    g.fillStyle = T.dark;
    g.fillRect(bx + band / 2 - band * 0.22, y0, band * 0.22, bodyH);
    rivets(g, [bx], [y0 + 5, base - 5, y0 + bodyH / 2], 1.1, T.rivet);
  }
  g.fillStyle = INK;
  g.fillRect(x0 - 1.6, base - 5.2, w + 3.2, 5.2 + 1.6);
  g.fillStyle = T.base;
  g.fillRect(x0, base - 4.4, w, 4.4);
  g.fillStyle = T.light;
  g.fillRect(x0, base - 4.4, w, 1.2);
  for (const [cx, sx] of [[x0, 1], [x1, -1]]) {
    g.fillStyle = INK;
    g.beginPath();
    g.moveTo(cx - sx * 1.6, y0 - 1.6);
    g.lineTo(cx + sx * 9, y0 - 1.6);
    g.lineTo(cx + sx * 9, y0 + 4);
    g.lineTo(cx + sx * 4, y0 + 4);
    g.lineTo(cx + sx * 4, y0 + 9);
    g.lineTo(cx - sx * 1.6, y0 + 9);
    g.closePath();
    g.fill();
    g.fillStyle = T.base;
    g.beginPath();
    g.moveTo(cx, y0);
    g.lineTo(cx + sx * 8, y0);
    g.lineTo(cx + sx * 8, y0 + 3);
    g.lineTo(cx + sx * 3, y0 + 3);
    g.lineTo(cx + sx * 3, y0 + 8);
    g.lineTo(cx, y0 + 8);
    g.closePath();
    g.fill();
    rivets(g, [cx + sx * 1.6], [y0 + 1.6], 0.9, T.rivet);
  }
  // Lock plate (its upper half sits on the lid)
  lockPlate(g, K, y0, 'body');
}

function lockPlate(g, K, y0, part) {
  const T = K.trim;
  const big = !!K.gem;
  const pw = big ? 17 : 12;
  const ph = big ? 19 : 14;
  const top = y0 - ph * 0.45;
  g.save();
  g.beginPath();
  if (part === 'body') g.rect(0, y0, 100, 100);
  else g.rect(0, 0, 100, y0);
  g.clip();
  g.fillStyle = INK;
  g.beginPath();
  rrect(g, 50 - pw / 2 - 1.4, top - 1.4, pw + 2.8, ph + 2.8, 3.6);
  g.fill();
  const gr = g.createLinearGradient(0, top, 0, top + ph);
  gr.addColorStop(0, T.light);
  gr.addColorStop(0.45, T.base);
  gr.addColorStop(1, T.dark);
  g.fillStyle = gr;
  g.beginPath();
  rrect(g, 50 - pw / 2, top, pw, ph, 3);
  g.fill();
  if (big) {
    // Faceted gem
    const G = K.gem;
    const cy = top + ph * 0.5;
    const r = 5.6;
    const pts = [];
    for (let i = 0; i < 6; i++) pts.push([50 + Math.cos(-Math.PI / 2 + (i * TAU) / 6) * r, cy + Math.sin(-Math.PI / 2 + (i * TAU) / 6) * r * 1.1]);
    g.fillStyle = INK;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x + (x - 50) * 0.2, y + (y - cy) * 0.2) : g.moveTo(x + (x - 50) * 0.2, y + (y - cy) * 0.2)));
    g.closePath();
    g.fill();
    g.fillStyle = G.base;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.fillStyle = G.dark;
    g.beginPath();
    g.moveTo(50, cy);
    g.lineTo(pts[1][0], pts[1][1]);
    g.lineTo(pts[2][0], pts[2][1]);
    g.lineTo(pts[3][0], pts[3][1]);
    g.closePath();
    g.fill();
    g.fillStyle = G.light;
    g.beginPath();
    g.moveTo(50, cy);
    g.lineTo(pts[4][0], pts[4][1]);
    g.lineTo(pts[5][0], pts[5][1]);
    g.lineTo(pts[0][0], pts[0][1]);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(48.2, cy - 2.4, 1, 0, TAU);
    g.fill();
  } else {
    // Keyhole
    g.fillStyle = '#1d1a20';
    g.beginPath();
    g.arc(50, top + ph * 0.55, 1.7, 0, TAU);
    g.moveTo(49.2, top + ph * 0.55);
    g.lineTo(48.6, top + ph * 0.86);
    g.lineTo(51.4, top + ph * 0.86);
    g.lineTo(50.8, top + ph * 0.55);
    g.fill();
  }
  g.restore();
}

function paintLid(g, K, under = false) {
  const { w, bodyH, lidH, base, band } = K;
  const x0 = 50 - w / 2 - 1.5; // the lid overhangs a little
  const x1 = 50 + w / 2 + 1.5;
  const y0 = base - bodyH;
  const W = K.wood;
  const T = K.trim;
  g.fillStyle = INK;
  g.beginPath();
  lidPath(g, x0 - 1.6, x1 + 1.6, y0 + 1.2, lidH + 2.8);
  g.fill();
  g.save();
  g.beginPath();
  lidPath(g, x0, x1, y0, lidH);
  g.clip();
  if (under) {
    // The inside of the lid: darker wood, lit warm by what's in the chest
    const gr = g.createLinearGradient(0, y0 - lidH, 0, y0);
    gr.addColorStop(0, W.dark);
    gr.addColorStop(1, '#c8893a');
    g.fillStyle = gr;
    g.fillRect(x0, y0 - lidH - 2, x1 - x0, lidH + 2);
    g.fillStyle = 'rgba(40,16,4,0.35)';
    for (let i = 1; i < 4; i++) g.fillRect(x0, y0 - (lidH * i) / 4, x1 - x0, 0.9);
    g.restore();
    return;
  }
  const gr = g.createLinearGradient(x0, y0 - lidH, x1, y0);
  gr.addColorStop(0, W.light);
  gr.addColorStop(0.5, W.base);
  gr.addColorStop(1, W.dark);
  g.fillStyle = gr;
  g.fillRect(x0, y0 - lidH - 2, x1 - x0, lidH + 2);
  // Curved plank seams following the arch
  g.strokeStyle = W.line;
  g.lineWidth = 0.9;
  const cx = (x0 + x1) / 2;
  for (const k of [0.38, 0.68]) {
    g.beginPath();
    g.ellipse(cx, y0 - lidH * 0.42 + lidH * k * 0.9, (x1 - x0) / 2, lidH * 0.58 * (1 - k * 0.2), 0, Math.PI, TAU);
    g.stroke();
  }
  // Highlight along the top of the arch
  g.strokeStyle = 'rgba(255,236,200,0.45)';
  g.lineWidth = 2.2;
  g.beginPath();
  g.ellipse(cx, y0 - lidH * 0.42 + 2, (x1 - x0) / 2 - 3, lidH * 0.58 - 2.5, 0, Math.PI * 1.1, Math.PI * 1.55);
  g.stroke();
  // Bands over the lid
  for (const bx of [50 - w / 2 + w * 0.2, 50 + w / 2 - w * 0.2]) {
    g.fillStyle = INK;
    g.fillRect(bx - band / 2 - 0.8, y0 - lidH - 2, band + 1.6, lidH + 2);
    g.fillStyle = T.base;
    g.fillRect(bx - band / 2, y0 - lidH - 2, band, lidH + 2);
    g.fillStyle = T.light;
    g.fillRect(bx - band / 2, y0 - lidH - 2, band * 0.3, lidH + 2);
    rivets(g, [bx], [y0 - lidH * 0.3], 1.1, T.rivet);
  }
  // Rim along the bottom of the lid
  g.fillStyle = INK;
  g.fillRect(x0, y0 - 4.6, x1 - x0, 4.6);
  g.fillStyle = T.base;
  g.fillRect(x0, y0 - 3.8, x1 - x0, 3.2);
  g.fillStyle = T.light;
  g.fillRect(x0, y0 - 3.8, x1 - x0, 1);
  g.restore();
  lockPlate(g, K, y0, 'lid');
}

function sprites(kind, W, H) {
  const key = `${kind}|${W}x${H}`;
  let c = caches.get(key);
  if (c) return c;
  const K = KINDS[kind];
  const u = Math.min(W, H) / 100;
  const mk = (paint) => {
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.setTransform(u, 0, 0, u, (W - 100 * u) / 2, (H - 100 * u) / 2);
    g.lineJoin = 'round';
    paint(g);
    return cv;
  };
  c = { body: mk((g) => paintBody(g, K)), lid: mk((g) => paintLid(g, K)), under: mk((g) => paintLid(g, K, true)) };
  if (caches.size > 12) caches.clear();
  caches.set(key, c);
  return c;
}

/** Light rays that fade out toward R (so they never show the canvas edge). */
function rays(g, cx, cy, R, n, rot, alpha, col) {
  const fade = g.createRadialGradient(cx, cy, 0, cx, cy, R);
  fade.addColorStop(0, col);
  fade.addColorStop(0.55, col);
  fade.addColorStop(1, 'rgba(255,240,180,0)');
  g.fillStyle = fade;
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    const w = (TAU / n) * 0.32;
    g.globalAlpha = alpha * (i % 2 ? 0.55 : 1);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
    g.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.3 : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

/**
 * Draw a chest onto `canvas` (cleared first). kind: 'small' | 'big'.
 * opts: { t: seconds, open: 0..1 (lid), shake: 0..1, glow: 0..1 (light burst), ready }.
 */
export function drawChest(canvas, kind, opts = {}) {
  if (!canvas || typeof document === 'undefined') return;
  const K = KINDS[kind] || KINDS.small;
  const Wc = canvas.width;
  const Hc = canvas.height;
  if (!(Wc > 0 && Hc > 0)) return;
  const g = canvas.getContext('2d');
  const t = num(opts.t, 0);
  const open = clamp(num(opts.open, 0), 0, 1);
  const shake = clamp(num(opts.shake, 0), 0, 1);
  const ready = !!opts.ready;
  const glow = clamp(num(opts.glow, ready && open === 0 ? 0.3 + 0.12 * Math.sin(t * 2.4) : 0), 0, 1);
  const u = Math.min(Wc, Hc) / 100;
  const S = sprites(kind === 'big' ? 'big' : 'small', Wc, Hc);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, Wc, Hc);
  // Design units from here on
  g.setTransform(u, 0, 0, u, (Wc - 100 * u) / 2, (Hc - 100 * u) / 2);
  const y0 = K.base - K.bodyH;
  // A ready chest gives a little hop every couple of seconds
  let hop = 0;
  let squash = 0;
  if (ready && open === 0 && shake === 0) {
    const ph = (t % 2.6) / 2.6;
    if (ph < 0.16) hop = Math.sin((ph / 0.16) * Math.PI) * 6;
    else if (ph < 0.24) squash = Math.sin(((ph - 0.16) / 0.08) * Math.PI) * 0.07;
  }
  // Light behind the chest
  if (glow > 0.01) {
    const cy = y0 - 4 - hop;
    const rg = g.createRadialGradient(50, cy, 2, 50, cy, 48);
    rg.addColorStop(0, `rgba(255,246,200,${0.9 * glow})`);
    rg.addColorStop(0.5, `rgba(255,214,90,${0.45 * glow})`);
    rg.addColorStop(1, 'rgba(255,214,90,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, 100, 100);
    rays(g, 50, cy, 48, 14, t * 0.5, 0.4 * glow, '#fff2b0');
  }
  // Ground shadow (shrinks as it hops)
  g.fillStyle = `rgba(30,20,10,${0.28 - hop * 0.02})`;
  g.beginPath();
  g.ellipse(50, K.base + 1.5, K.w * 0.56 * (1 - hop * 0.03), 4.2, 0, 0, TAU);
  g.fill();
  // Wobble / hop about the bottom centre
  g.save();
  const wob = Math.sin(t * 38) * 0.08 * shake;
  g.translate(50 + Math.sin(t * 29) * 2.2 * shake, K.base - hop);
  g.rotate(wob);
  const sq = squash + Math.sin(t * 47) * 0.035 * shake;
  g.scale(1 + sq, 1 - sq);
  g.translate(-50, -K.base);
  const draw = (img) => g.drawImage(img, -(Wc - 100 * u) / 2 / u, -(Hc - 100 * u) / 2 / u, Wc / u, Hc / u);
  // The lid swings up and back about the hinge at the back of the chest. Seen a
  // little from above: the glowing mouth shows, the lid's front face rises and
  // foreshortens, and past upright we see its inside standing behind the mouth.
  const th = open * 1.95;
  const c = Math.cos(th);
  const mouthH = 8 * Math.min(1, open * 3);
  const mouthTop = y0 - mouthH;
  const edge = mouthTop - K.lidH * 0.55 * Math.sin(th); // the lid's front (bottom) edge while it rises
  if (open > 0 && c < 0) {
    g.save();
    g.translate(0, mouthTop + 1);
    g.scale(1, -c * 1.15);
    g.translate(0, -y0);
    draw(S.under);
    g.restore();
  }
  if (open > 0) {
    const mw = K.w - 3;
    const mg = g.createLinearGradient(0, mouthTop, 0, y0 + 2);
    mg.addColorStop(0, '#ffe9a0');
    mg.addColorStop(0.35, '#ffcf5a');
    mg.addColorStop(1, K.inside);
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(50, y0 - mouthH / 2 + 0.5, mw / 2 + 1.4, mouthH / 2 + 1.6, 0, 0, TAU);
    g.fill();
    g.fillStyle = mg;
    g.beginPath();
    g.ellipse(50, y0 - mouthH / 2 + 0.5, mw / 2, mouthH / 2 + 0.3, 0, 0, TAU);
    g.fill();
  }
  draw(S.body);
  if (open > 0 && glow > 0.01) {
    // Beams pouring up out of the chest
    g.save();
    g.beginPath();
    g.rect(-50, -50, 200, y0 + 50);
    g.clip();
    rays(g, 50, y0 + 4, 56, 9, -Math.PI / 2 - 0.9 + Math.sin(t * 1.3) * 0.05, 0.6 * glow * open, '#fff6c8');
    g.restore();
  }
  if (c > 0) {
    g.save();
    g.translate(0, edge);
    g.scale(1, c);
    g.translate(0, -y0);
    draw(S.lid);
    g.restore();
  }
  g.restore();
  // Sparkles around a ready chest (and a burst of them while it opens)
  if (ready || open > 0) {
    const n = open > 0 ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.8 + i * 0.37) % 1;
      const a = i * 2.4 + 0.6;
      const r = Math.min(44, (open > 0 ? 24 + ph * 20 : 28 + (i % 2) * 8) + K.w * 0.12);
      const x = 50 + Math.cos(a) * r;
      const y = y0 - 2 + Math.sin(a) * r * 0.65 - (open > 0 ? ph * 12 : 0);
      const s = Math.sin(ph * Math.PI) * (3.2 + (i % 3));
      if (s < 0.3) continue;
      g.fillStyle = INK;
      star(g, x, y, s + 1.1);
      g.fill();
      g.fillStyle = i % 2 ? '#fff6c2' : '#ffd84a';
      star(g, x, y, s);
      g.fill();
    }
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}
