// Trailer capture harness for We Left Ben (prototype 0).
// - Serves the repo's files from disk into headless Chromium (no server, nothing in the repo changes).
// - Runs the game on a virtual clock: exactly 1/30 s per frame, however slow the render is.
// - Drives the survivor with a scripted standard gamepad (analog move + aim, fire past the ring).
// - Hides the HUD panels and buttons (keeps the game's own call-outs) by patching hud.js as it is served.
// Usage: node capture.js <shot> <outDir> [every]   (every = keep 1 frame in N, for quick looks)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SHOTS = require(process.env.SHOTS || './shots.js');
const [name, outDir, everyArg] = process.argv.slice(2);
const EVERY = Number(everyArg || 1);
const shot = SHOTS[name];
if (!shot) throw new Error(`no shot "${name}"; have: ${Object.keys(SHOTS).join(', ')}`);
const FPS = 30;
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mp3': 'audio/mpeg',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};

function patchHud(src) {
  const swaps = [
    ['  if (S.threatIndicators && p.alive && !ui.title) drawThreats(ctx, game, L);',
      '  if (!window.__cleanHud) {\n  if (S.threatIndicators && p.alive && !ui.title) drawThreats(ctx, game, L);'],
    ['  if (S.showTouches) drawTouchDebug(ctx, input.touch, L);',
      '  if (S.showTouches) drawTouchDebug(ctx, input.touch, L);\n  }'],
    ['  if (game.won || game.lost) drawEnd(ctx, game, L, ui);', '  if ((game.won || game.lost) && !window.__cleanHud) drawEnd(ctx, game, L, ui);'],
    // window.__noHurt: no red damage vignette (god mode still takes hits, and each one flashes the screen).
    ['  let va = game.hurtFlash * 0.55;', '  let va = window.__noHurt ? -9 : game.hurtFlash * 0.55;'],
    ['  drawBossBar(ctx, game, L);\n  drawHoldoutBar(ctx, game, L);\n  drawFerryBar(ctx, game, L);',
      '  if (!window.__cleanHud) {\n  drawBossBar(ctx, game, L);\n  drawHoldoutBar(ctx, game, L);\n  drawFerryBar(ctx, game, L);\n  }'],
  ];
  for (const [a, b] of swaps) {
    if (!src.includes(a)) throw new Error('hud.js patch did not apply: ' + a.slice(0, 60));
    src = src.replace(a, b);
  }
  return src;
}

function initPage() {
  // Virtual clock: requestAnimationFrame and performance.now only move when the harness steps.
  let vnow = 1000;
  const q = [];
  let nextId = 1;
  window.requestAnimationFrame = (cb) => { q.push({ id: nextId, cb }); return nextId++; };
  window.cancelAnimationFrame = (id) => { const i = q.findIndex((e) => e.id === id); if (i >= 0) q.splice(i, 1); };
  Object.defineProperty(performance, 'now', { value: () => vnow, configurable: true });
  window.__vt = {
    step(ms) { vnow += ms; const cbs = q.splice(0, q.length); for (const e of cbs) e.cb(vnow); },
  };
  // A scripted standard gamepad: axes 0/1 move, 2/3 aim (screen directions, y down); buttons by index.
  const pad = { axes: [0, 0, 0, 0], buttons: new Array(17).fill(0) };
  window.__pad = pad;
  const getGamepads = () => [{
    id: 'trailer pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: vnow,
    axes: pad.axes.slice(), buttons: pad.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })),
  }];
  Object.defineProperty(Navigator.prototype, 'getGamepads', { value: getGamepads, configurable: true });
  window.__cleanHud = true;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (f.endsWith('.jpg')) fs.unlinkSync(path.join(outDir, f));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, serviceWorkers: 'block' });
  await ctx.addInitScript(initPage);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('[shot]')) console.log('console:', m.text()); });
  await page.route('http://localhost:8080/**', async (route) => {
    const u = new URL(route.request().url());
    let p = decodeURIComponent(u.pathname);
    if (p.startsWith('/__fonts/')) {
      const ff = path.join(__dirname, 'fontpkg', 'package', 'files', path.basename(p));
      return fs.existsSync(ff) ? route.fulfill({ status: 200, body: fs.readFileSync(ff), contentType: 'font/woff2' }) : route.fulfill({ status: 404, body: '' });
    }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(ROOT + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return route.fulfill({ status: 404, body: '' });
    let body = fs.readFileSync(f);
    if (p === '/src/render/hud.js') body = patchHud(body.toString());
    return route.fulfill({ status: 200, body, contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
  });

  await page.goto('http://localhost:8080/');
  await page.waitForFunction(() => window.__p0 && window.__p0.game && window.__p0.game.world, null, { polling: 100, timeout: 20000 });

  // CRAYON_FONT=1: the game asks for "Chalkboard SE" / "Comic Sans MS" for Ben's crayon (phones have them;
  // this container doesn't). Load Comic Neue (OFL) under those names so his writing looks as it does on a phone.
  if (process.env.CRAYON_FONT) {
    const ok = await page.evaluate(async () => {
      const loads = [];
      for (const fam of ['Chalkboard SE', 'Comic Sans MS']) {
        for (const [w, file] of [[400, 'comic-neue-latin-400-normal.woff2'], [700, 'comic-neue-latin-700-normal.woff2']]) {
          const f = new FontFace(fam, `url(/__fonts/${file})`, { weight: String(w) });
          document.fonts.add(f);
          loads.push(f.load());
        }
      }
      await Promise.all(loads);
      return document.fonts.check('700 12px "Chalkboard SE"');
    });
    console.log('crayon font loaded:', ok);
  }

  // A directed camera: window.__cam = { x, y, zoom, still } is applied just before each frame is drawn
  // (x/y lock the camera, zoom sets the view size, still drops the shake). null = the game's own camera.
  await page.evaluate(() => {
    const P = window.__p0;
    const R = P.renderer;
    const orig = R.render.bind(R);
    R.render = (game, input, ui) => {
      const c = window.__cam;
      if (c) {
        const S = game.settings;
        const L = game.level || S.level;
        if (c.zoom) S[`viewSize@${L}`] = c.zoom;
        if (c.x !== undefined && game.camera) { game.camera.x = c.x; game.camera.y = c.y; }
        if (c.still && game.camera) { game.camera.shakeX = 0; game.camera.shakeY = 0; }
        game.syncView();
      }
      return orig(game, input, ui);
    };
  });

  // World settings first (they shape the map), then a fresh run on the chosen seed.
  await page.evaluate(({ settings, seed }) => {
    const P = window.__p0;
    Object.assign(P.settings, { volume: 0, musicVolume: 0, laser: false, threatIndicators: false }, settings);
    P.newRun(seed);
  }, { settings: shot.settings || {}, seed: shot.seed || 1337 });
  await page.evaluate(() => window.__vt.step(1000 / 30));

  // The shot's own setup and per-frame direction run inside the page.
  await page.evaluate(({ helpers, setup, direct }) => {
    window.__h = eval('(' + helpers + ')')();
    window.__setup = eval('(' + setup + ')');
    window.__direct = eval('(' + direct + ')');
  }, { helpers: SHOTS.helpers.toString(), setup: (shot.setup || (() => {})).toString(), direct: (shot.direct || (() => {})).toString() });
  const info = await page.evaluate(async () => {
    const r = await window.__setup(window.__p0.game, window.__p0);
    window.__p0.start();
    return r;
  });
  console.log('setup:', JSON.stringify(info));

  const pre = shot.pre || 0;
  const total = pre + shot.frames;
  const t0 = Date.now();
  let saved = 0;
  for (let i = 0; i < total; i++) {
    const log = await page.evaluate((i) => {
      const g = window.__p0.game;
      const r = window.__direct(i, g, window.__pad, window.__p0);
      window.__vt.step(1000 / 30);
      return r;
    }, i);
    if (log) console.log(`f${i}:`, typeof log === 'string' ? log : JSON.stringify(log));
    const k = i - pre;
    if (k >= 0 && k % EVERY === 0 && (!shot.keep || shot.keep(k))) {
      await page.screenshot({ path: path.join(outDir, `f${String(k).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 92 });
      saved++;
    }
  }
  console.log(`${name}: ${total} frames stepped, ${saved} saved, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
