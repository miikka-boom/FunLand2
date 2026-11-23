#!/usr/bin/env node
// Films the trailer's shots from the real game (see stage.js and shots.js).
//
//   node tools/trailer/capture.cjs                     every shot -> tools/trailer/out/shots/NAME.mp4 + NAME.wav
//   node tools/trailer/capture.cjs hunter_save witch   just these
//   node tools/trailer/capture.cjs --preview hunter_save   1x, a JPEG every 10 frames, no video
//   node tools/trailer/capture.cjs --scout city:1337   the map from above with a coordinate grid
//        --area x,y,w,h  zooms the scout view in on part of the map
//
// No server: the page's requests are answered from the repository by request
// interception. A few strings are patched on the way in (HUD switches, the
// teammate's name); the game in the repository is untouched.

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out');
const ORIGIN = 'http://game.local';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };

// The HUD in parts (ui.hud switches), and the teammate called by a friend's name.
const NAME = "(window.__friend || 'ALLY')";
const PATCHES = {
  '/src/render/hud.js': [
    ['  if (S.threatIndicators && p.alive && !ui.title) drawThreats(ctx, game, L);', '  const HF = ui.hud || {};\n  if (HF.threats !== false && S.threatIndicators && p.alive && !ui.title) drawThreats(ctx, game, L);'],
    ['  if (!game.won && !game.lost && !ui.title) drawObjective(ctx, game, L);', '  if (HF.objective !== false && !game.won && !game.lost && !ui.title) drawObjective(ctx, game, L);'],
    ['  drawHealth(ctx, game, L);\n  if (game.ally) drawAllyPanel(ctx, game, L);', '  if (HF.panels !== false) drawHealth(ctx, game, L);\n  if (HF.panels !== false && game.ally) drawAllyPanel(ctx, game, L);'],
    ['  if (game.ally && game.ally.alive && !ui.title) drawAllyMarker(ctx, game, L);', '  if (HF.marker !== false && game.ally && game.ally.alive && !ui.title) drawAllyMarker(ctx, game, L);'],
    ['  drawWeapon(ctx, game, L, ui);\n  if (!ui.title) drawBuffs(ctx, game, L);\n  drawStats(ctx, game, L);\n  drawButtons(ctx, game, L, input.touch);', '  if (HF.panels !== false) drawWeapon(ctx, game, L, ui);\n  if (HF.panels !== false && !ui.title) drawBuffs(ctx, game, L);\n  if (HF.panels !== false) drawStats(ctx, game, L);\n  if (HF.buttons !== false) drawButtons(ctx, game, L, input.touch);'],
    ["  if (input.source === 'touch' || ui.forceSticks) {", "  if (HF.sticks !== false && (input.source === 'touch' || ui.forceSticks)) {"],
    ['  drawBossBar(ctx, game, L);\n  drawHoldoutBar(ctx, game, L);\n  drawFerryBar(ctx, game, L);\n  if (p.pinnedBy && p.alive) drawPinned(ctx, game, L);\n  drawMessages(ctx, game, L);\n  if (game.won || game.lost) drawEnd(ctx, game, L, ui);', '  if (HF.bars !== false) drawBossBar(ctx, game, L);\n  if (HF.bars !== false) drawHoldoutBar(ctx, game, L);\n  if (HF.bars !== false) drawFerryBar(ctx, game, L);\n  if (HF.pinned !== false && p.pinnedBy && p.alive) drawPinned(ctx, game, L);\n  if (HF.messages !== false) drawMessages(ctx, game, L);\n  if (HF.end !== false && (game.won || game.lost)) drawEnd(ctx, game, L, ui);'],
    ["ctx.fillText('ALLY', b.x + 10, b.y + b.h / 2);", `ctx.fillText(${NAME}, b.x + 10, b.y + b.h / 2);`],
    ["ctx.fillText('ALLY', sx, y);", `ctx.fillText(${NAME}, sx, y);`],
    ['`ALLY DOWN ${m}m` : `ALLY ${m}m`', '`${' + NAME + '} DOWN ${m}m` : `${' + NAME + '} ${m}m`'],
    ["ctx.fillText('ALLY ON THE WAY'", "ctx.fillText(`${" + NAME + "} ON THE WAY`"],
  ],
  '/src/game/ally.js': [
    ["'ALLY DOWN — revive them'", '`${' + NAME + '} IS DOWN — REVIVE!`'],
    ["'ALLY BACK UP'", '`${' + NAME + '} IS BACK UP`'],
    ["'ALLY HEALED'", '`${' + NAME + '} HEALED`'],
    ["'ALLY SAVED YOU'", '`${' + NAME + '} SAVED YOU`'],
    ["'ALLY DIED'", '`${' + NAME + '} DIED`'],
  ],
};

const PRELUDE = `
(function () {
  // A virtual clock: every frame is exactly 1/30 s, however long it takes to draw.
  var vnow = 0;
  performance.now = function () { return vnow; };
  window.__clock = { get: function () { return vnow; }, set: function (v) { vnow = v; }, advance: function (ms) { vnow += ms; } };
  // A seeded Math.random (sfc32), so a shot replays the same way.
  var a = 1, b = 2, c = 3, d = 4;
  function sfc32() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    var t = (a + b) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  window.__seed = function (s) { a = 0x9e3779b9; b = 0x243f6a88; c = 0xb7e15162; d = s >>> 0; for (var i = 0; i < 15; i++) sfc32(); };
  window.__seed(1);
  Math.random = sfc32;
  // "new AudioContext()" hands back the offline context the stage prepared, which always says it is running.
  var OAC = window.OfflineAudioContext;
  function StageAudioContext() {
    var ctx = window.__nextCtx || new OAC(2, 48000, 48000);
    window.__nextCtx = null;
    ctx.__resume = OAC.prototype.resume.bind(ctx);
    ctx.__suspend = OAC.prototype.suspend.bind(ctx);
    ctx.resume = function () { return Promise.resolve(); };
    ctx.suspend = function () { return Promise.resolve(); };
    Object.defineProperty(ctx, 'state', { get: function () { return 'running'; }, configurable: true });
    return ctx;
  }
  window.AudioContext = StageAudioContext;
  window.webkitAudioContext = StageAudioContext;
})();
`;

// Fonts from Google Fonts (OFL), fetched once into out/fonts. Gochi Hand stands in for the
// crayon lines' first choice, Chalkboard SE (what an iPhone shows): this container has no
// handwriting font, and the fallback ("cursive") comes out as a serif italic.
const FONTS = { GochiHand: 'Gochi+Hand', Anton: 'Anton' };
const FONT_DIR = path.join(OUT, 'fonts');

function ensureFonts() {
  fs.mkdirSync(FONT_DIR, { recursive: true });
  for (const [name, family] of Object.entries(FONTS)) {
    const file = path.join(FONT_DIR, `${name}.ttf`);
    if (fs.existsSync(file)) continue;
    const css = execFileSync('curl', ['-sf', '--max-time', '20', `https://fonts.googleapis.com/css2?family=${family}&display=swap`]).toString();
    const m = css.match(/https:\/\/fonts\.gstatic\.com[^)]+/);
    if (!m) throw new Error(`no font file for ${family}`);
    execFileSync('curl', ['-sf', '--max-time', '30', '-o', file, m[0]]);
  }
}

function stageHtml(size) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;background:#000;overflow:hidden}canvas{display:block}
@font-face{font-family:"Chalkboard SE";src:url(/__fonts/GochiHand.ttf);font-weight:100 900}</style>
<script>window.__stageSize = ${JSON.stringify(size)};${PRELUDE}</script></head>
<body><canvas id="game"></canvas>
<script type="module">import '/tools/trailer/stage.js'; import '/tools/trailer/shots.js'; window.__stageReady = true;</script>
</body></html>`;
}

async function serve(context, size) {
  await context.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    const p = decodeURIComponent(url.pathname);
    if (p === '/__stage.html') return route.fulfill({ status: 200, contentType: 'text/html', body: stageHtml(size) });
    if (p.startsWith('/__fonts/')) {
      const f = path.join(FONT_DIR, path.basename(p));
      return fs.existsSync(f) ? route.fulfill({ status: 200, contentType: 'font/ttf', body: fs.readFileSync(f) }) : route.fulfill({ status: 404, body: 'no font' });
    }
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    let body = fs.readFileSync(file);
    if (PATCHES[p]) {
      let s = body.toString('utf8');
      for (const [a, b] of PATCHES[p]) {
        if (!s.includes(a)) throw new Error(`patch no longer applies to ${p}: ${a.slice(0, 70)}`);
        s = s.split(a).join(b);
      }
      body = Buffer.from(s, 'utf8');
    }
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body });
  });
}

async function openStage(browser, { w = 960, h = 540, dpr = 2 } = {}) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await serve(context, { w, h });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.error(`console ${m.type()}:`, m.text());
  });
  await page.goto(`${ORIGIN}/__stage.html`);
  await page.waitForFunction(() => window.__stageReady === true, null, { timeout: 30000 });
  await page.evaluate(() => window.stage.ready());
  await page.evaluate(() => document.fonts.load('700 16px "Chalkboard SE"'));
  return { context, page };
}

function ffmpegWriter(file) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '11', '-pix_fmt', 'yuv420p', '-r', '30', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((ok, bad) => ff.on('close', (code) => (code === 0 ? ok() : bad(new Error(`ffmpeg exited ${code}`)))));
  return {
    async write(buf) {
      if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once('drain', ok));
    },
    async close() {
      ff.stdin.end();
      await done;
    },
  };
}

async function grab(page, type = 'png') {
  const url = await page.evaluate((type) => window.stage.canvas.toDataURL(type === 'png' ? 'image/png' : 'image/jpeg', 0.9), type);
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
}

async function film(page, name, { preview = false, every = 10 } = {}) {
  const info = await page.evaluate((n) => window.stage.prepare(n), name);
  await page.evaluate(() => window.stage.roll());
  const dir = path.join(OUT, preview ? 'preview' : 'shots');
  fs.mkdirSync(dir, { recursive: true });
  const mine = new RegExp(`^${name}_(p2_)?\\d{4}\\.jpg$`);
  if (preview) for (const f of fs.readdirSync(dir)) if (mine.test(f)) fs.unlinkSync(path.join(dir, f));
  const t0 = Date.now();
  let writer = null;
  let writer2 = null;
  if (!preview) writer = ffmpegWriter(path.join(dir, `${name}.mp4`));
  if (!preview && info.views === 2) writer2 = ffmpegWriter(path.join(dir, `${name}_p2.mp4`));
  for (let k = 0; k < info.frames; k++) {
    await page.evaluate(() => window.stage.frame());
    const still = k % every === 0 || k === info.frames - 1;
    if (preview) {
      if (still) fs.writeFileSync(path.join(dir, `${name}_${String(k).padStart(4, '0')}.jpg`), await grab(page, 'jpeg'));
    } else await writer.write(await grab(page, 'png'));
    if (info.views === 2) {
      await page.evaluate(() => window.stage.renderAlt());
      if (preview) {
        if (still) fs.writeFileSync(path.join(dir, `${name}_p2_${String(k).padStart(4, '0')}.jpg`), await grab(page, 'jpeg'));
      } else await writer2.write(await grab(page, 'png'));
    }
  }
  if (writer) await writer.close();
  if (writer2) await writer2.close();
  const wav = await page.evaluate(() => window.stage.finish());
  fs.writeFileSync(path.join(dir, `${name}.wav`), Buffer.from(wav, 'base64'));
  const log = await page.evaluate(() => (window.stage.T.log || []).slice());
  if (log.length) fs.writeFileSync(path.join(dir, `${name}.log.json`), JSON.stringify(log, null, 1));
  console.log(`${name}: ${info.frames} frames (${info.level}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (f) => {
    const i = args.indexOf(f);
    if (i < 0) return null;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const preview = args.includes('--preview');
  if (preview) args.splice(args.indexOf('--preview'), 1);
  const every = Number(flag('--every') || 10);
  const scoutArg = flag('--scout');
  const area = flag('--area');
  const set = flag('--set');
  ensureFonts();
  const browser = await chromium.launch();
  try {
    if (scoutArg) {
      const [level, seed] = scoutArg.split(':');
      const { page } = await openStage(browser, { w: 1600, h: 1100, dpr: 1 });
      const a = area ? area.split(',').map(Number) : null;
      const extra = set ? JSON.parse(set) : {};
      const facts = await page.evaluate(([level, seed, a, extra]) => window.stage.scout(level, Number(seed || 1337), Object.assign(a ? { area: { x: a[0], y: a[1], w: a[2], h: a[3] } } : {}, { settings: extra })), [level, seed, a, extra]);
      fs.mkdirSync(path.join(OUT, 'scout'), { recursive: true });
      const file = path.join(OUT, 'scout', `${level}_${seed || 1337}${a ? '_' + a.join('_') : ''}.jpg`);
      fs.writeFileSync(file, await grab(page, 'jpeg'));
      console.log(file);
      console.log(JSON.stringify(facts));
      return;
    }
    const { page } = await openStage(browser, preview ? { dpr: 1 } : {});
    const all = await page.evaluate(() => window.__shotNames || []);
    const names = args.length ? args : all;
    for (const n of names) await film(page, n, { preview, every });
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
