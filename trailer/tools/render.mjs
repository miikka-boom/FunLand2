#!/usr/bin/env node
// Films the trailer (trailer/?capture=1) frame by frame in headless Chromium and encodes it.
//
//   node trailer/tools/render.mjs                       the whole trailer -> trailer/out/we-left-ben-trailer.mp4
//   node trailer/tools/render.mjs --from 38 --to 46     a stretch of it (no sound unless --audio)
//   node trailer/tools/render.mjs --stills 5,12.5,40    single frames -> trailer/out/still-*.png
//   node trailer/tools/render.mjs --cut 30              the 30-second cut -> trailer/out/trailer-30s.mp4
//   options: --fps 30 --width 1280 --height 720 --scale 1.5 (1920x1080) --crf 17 --out FILE
//            --vertical (1080x1920 cut, centred) --no-audio --jpeg-quality 0.95
//
// Needs Playwright with Chromium and ffmpeg (both preinstalled in Claude Code cloud sessions).
// The film clock is the page's, so a slow machine films the same frames, only slower.

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { dirname, join, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const OUT = join(ROOT, 'trailer', 'out');

// --- Options ---------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const has = (name) => argv.includes(`--${name}`);
const FPS = Number(opt('fps', 30));
const VERTICAL = has('vertical');
const WIDTH = Number(opt('width', VERTICAL ? 720 : 1280));
const HEIGHT = Number(opt('height', VERTICAL ? 1280 : 720));
const SCALE = Number(opt('scale', 1.5));
const CRF = Number(opt('crf', 17));
const JPEG_Q = Number(opt('jpeg-quality', 0.95));
const stills = opt('stills', null);
const CUT = String(opt('cut', 'full'));

// --- A static server for the repo ----------------------------------------------------------------

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = resolve(ROOT, `.${p}`);
    if (file !== ROOT && !file.startsWith(ROOT + sep)) throw new Error('outside');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const port = server.address().port;

// --- The browser ------------------------------------------------------------------------------------

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: SCALE });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[page ${m.type()}] ${m.text()}`);
});
await page.goto(`http://127.0.0.1:${port}/trailer/?capture=1&fps=${FPS}${CUT !== 'full' ? `&cut=${encodeURIComponent(CUT)}` : ''}`);
await page.waitForFunction(() => window.__trailer, null, { timeout: 30000 });
const t0 = Date.now();
await page.evaluate(() => window.__trailer.ready);
const info = await page.evaluate(() => ({ duration: window.__trailer.duration, shots: window.__trailer.shots, cut: window.__trailer.cut }));
if (info.cut !== CUT) {
  console.error(`no cut called "${CUT}"`);
  process.exit(1);
}
console.log(`trailer (${info.cut} cut): ${info.duration.toFixed(2)} s, ${info.shots.length} shots; ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (errors.length) console.log('page errors:', errors);
await mkdir(OUT, { recursive: true });

const fail = async (msg) => {
  console.error(msg);
  await browser.close();
  server.close();
  process.exit(1);
};

// --- Trace (timing a shot's cues: what happens when, without filming) ----------------------------------

const traceId = opt('trace', null);
if (traceId) {
  for (const id of String(traceId).split(',')) {
    console.log(`--- ${id}`);
    console.log(await page.evaluate(([id, every]) => window.__trailer.trace(id, every), [id, Number(opt('every', 0.1))]));
  }
  if (errors.length) console.log('page errors:', errors);
  await browser.close();
  server.close();
  process.exit(0);
}

// --- Stills -------------------------------------------------------------------------------------------

if (stills) {
  const times = String(stills).split(',').map(Number).filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  // Frames go in order: each still is filmed from its shot's start (shots replay identically).
  for (const t of times) {
    const T = Math.round(t * FPS) / FPS;
    const res = await page.evaluate((T) => {
      const tr = window.__trailer;
      tr.film.shotI = -1; // start its shot over
      tr.frame(T);
      return { url: tr.grab('image/png'), dbg: tr.debug() };
    }, T);
    if (errors.length) await fail(`page error: ${errors.join('\n')}`);
    const name = join(OUT, `still-${T.toFixed(2).padStart(6, '0')}.png`);
    await writeFile(name, Buffer.from(res.url.split(',')[1], 'base64'));
    console.log(name, JSON.stringify(res.dbg));
  }
  await browser.close();
  server.close();
  process.exit(0);
}

// --- Video -------------------------------------------------------------------------------------------

const from = Number(opt('from', 0));
const to = Math.min(info.duration, Number(opt('to', info.duration)));
const full = from <= 0 && to >= info.duration - 1e-6;
const withAudio = !has('no-audio') && (full || has('audio'));
const NAME = CUT === 'full' ? 'we-left-ben-trailer' : `trailer-${CUT}s`; // (the short cut keeps the title out of its file name too)
const out = resolve(String(opt('out', join(OUT, full ? `${NAME}${VERTICAL ? '-vertical' : ''}.mp4` : `part-${from}-${to}.mp4`))));
const silent = withAudio ? out.replace(/\.mp4$/, '.video.mp4') : out;
const pxW = Math.round(WIDTH * SCALE);
const pxH = Math.round(HEIGHT * SCALE);
const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-vf', `scale=${pxW}:${pxH}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF), '-tune', 'film', '-movflags', '+faststart', '-r', String(FPS), silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((ok, bad) => ff.on('close', (code) => (code === 0 ? ok() : bad(new Error(`ffmpeg exited ${code}`)))));

const first = Math.round(from * FPS);
const last = Math.round(to * FPS);
const n = last - first;
let lastLog = Date.now();
const started = Date.now();
for (let i = first; i < last; i++) {
  const T = i / FPS;
  const url = await page.evaluate(
    ([T, q]) => {
      window.__trailer.frame(T);
      return window.__trailer.grab('image/jpeg', q);
    },
    [T, JPEG_Q],
  );
  if (errors.length) await fail(`page error at ${T.toFixed(2)} s: ${errors.join('\n')}`);
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (!ff.stdin.write(buf)) await new Promise((ok) => ff.stdin.once('drain', ok));
  if (Date.now() - lastLog > 5000) {
    lastLog = Date.now();
    const done = i - first + 1;
    const rate = done / ((Date.now() - started) / 1000);
    console.log(`  ${T.toFixed(1)} s  frame ${done}/${n}  ${rate.toFixed(1)} fps  eta ${((n - done) / rate).toFixed(0)} s`);
  }
}
ff.stdin.end();
await ffDone;
console.log(`video: ${silent} (${n} frames in ${((Date.now() - started) / 1000).toFixed(0)} s)`);

if (withAudio) {
  const a0 = Date.now();
  const chunks = await page.evaluate(() => window.__trailer.renderAudio());
  const parts = [];
  for (let i = 0; i < chunks; i++) parts.push(Buffer.from(await page.evaluate((i) => window.__trailer.audioChunk(i), i), 'base64'));
  const wavFile = out.replace(/\.mp4$/, '.wav');
  await writeFile(wavFile, Buffer.concat(parts));
  console.log(`sound: ${wavFile} (rendered in ${((Date.now() - a0) / 1000).toFixed(0)} s)`);
  const seek = from > 0 ? ['-ss', String(from)] : [];
  // Loudness for the web: measure, then normalise to -14 LUFS with a -1.5 dBTP ceiling (two passes; AAC overshoots a little).
  const run = (args) =>
    new Promise((ok, bad) => {
      const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let err = '';
      p.stderr.on('data', (d) => (err += d));
      p.on('close', (code) => (code === 0 ? ok(err) : bad(new Error(`ffmpeg exited ${code}: ${err.slice(-400)}`))));
    });
  const TARGET = 'I=-14:TP=-1.5:LRA=20'; // (a wide LRA keeps it one linear gain: a trailer lives on its dynamics)
  const probe = await run(['-hide_banner', '-nostats', ...seek, '-i', wavFile, '-af', `loudnorm=${TARGET}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(probe.slice(probe.lastIndexOf('{'), probe.lastIndexOf('}') + 1));
  const norm = `loudnorm=${TARGET}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  console.log(`loudness: ${m.input_i} LUFS (peak ${m.input_tp} dBTP) -> -14 LUFS`);
  await run(['-v', 'error', '-y', '-i', silent, ...seek, '-i', wavFile, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', `${norm},aresample=48000`, '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out]);
  await rm(silent);
  console.log(`trailer: ${out} (${((await stat(out)).size / 1e6).toFixed(1)} MB)`);
}

await browser.close();
server.close();
