// WOBBLE WAR as an installable offline app: the service worker's precache list must cover the
// whole app (or the game breaks offline), every entry must exist (or the install fails), the
// worker must stay inside battle/, and the manifest + icons must be what the stores expect.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATTLE = path.join(ROOT, 'battle');
const BASE = 'https://miikka-boom.github.io/FunLand2/battle/';
const SHELL = ['index.html', 'style.css', 'icon.svg', 'manifest.webmanifest', 'icons/apple-touch-icon.png'];

/** Runs battle/sw.js in a sandbox with a fake worker scope; returns its constants and listeners. */
function loadSW({ cacheKeys = [], deleted = [], hits = {} } = {}) {
  const code = fs.readFileSync(path.join(BATTLE, 'sw.js'), 'utf8');
  const listeners = {};
  const cache = {
    match: async (req) => hits[typeof req === 'string' ? req : req.url],
    put: async () => {},
    addAll: async () => {},
  };
  const sandbox = {
    URL,
    console,
    self: {
      location: new URL('sw.js', BASE),
      registration: { scope: BASE },
      addEventListener: (type, fn) => (listeners[type] = fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async () => cache,
      keys: async () => cacheKeys,
      delete: async (k) => deleted.push(k),
    },
    fetch: async (req) => ({ status: 200, type: 'basic', url: req.url, clone() { return this; } }),
    Request: class {
      constructor(url, init) {
        this.url = url;
        Object.assign(this, init);
      }
    },
    Response: class {},
  };
  vm.createContext(sandbox);
  vm.runInContext(`${code}\n;self.__out = { VERSION, CACHE, CACHE_PREFIX, PRECACHE };`, sandbox, { filename: 'sw.js' });
  return { ...sandbox.self.__out, listeners };
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (!e.name.startsWith('.')) out.push(p);
  }
  return out;
}

const rel = (abs) => './' + path.relative(BATTLE, abs).split(path.sep).join('/');
const sw = loadSW();
const listed = new Set(sw.PRECACHE);

test('sw.js precaches every file under battle/src/', () => {
  const missing = walk(path.join(BATTLE, 'src')).map(rel).filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `add these to PRECACHE in battle/sw.js (and bump VERSION): ${missing.join(', ')}`);
});

test('sw.js precaches the app shell and every icon', () => {
  const icons = walk(path.join(BATTLE, 'icons')).map(rel);
  assert.ok(icons.length >= 4, 'battle/icons/ has the PWA icons');
  const missing = [...SHELL.map((f) => './' + f), ...icons].filter((f) => !listed.has(f));
  assert.deepEqual(missing, [], `add these to PRECACHE in battle/sw.js: ${missing.join(', ')}`);
});

test('every precache entry exists, stays inside battle/ and is listed once', () => {
  assert.equal(listed.size, sw.PRECACHE.length, 'no duplicate entries');
  for (const p of sw.PRECACHE) {
    assert.match(p, /^\.\/[^?#]+$/, `${p}: relative to battle/, no query or hash`);
    assert.ok(!p.split('/').includes('..'), `${p} must stay inside battle/`);
    assert.notEqual(p, './sw.js', 'never precache the worker itself');
    assert.ok(fs.existsSync(path.join(BATTLE, p)), `${p} is listed in sw.js but does not exist (the install would fail)`);
  }
});

test('one VERSION names the cache', () => {
  assert.equal(typeof sw.VERSION, 'string');
  assert.ok(sw.VERSION.trim().length > 0, 'VERSION is set');
  assert.equal(sw.CACHE, sw.CACHE_PREFIX + sw.VERSION);
  assert.equal(sw.CACHE_PREFIX, 'wobble-war-');
});

test('the worker never handles requests outside battle/', () => {
  const run = (url, init = {}) => {
    let responded = false;
    sw.listeners.fetch({
      request: { url, method: 'GET', mode: 'no-cors', cache: 'default', ...init },
      respondWith: (p) => {
        responded = true;
        Promise.resolve(p).catch(() => {});
      },
    });
    return responded;
  };
  const site = 'https://miikka-boom.github.io';
  // The repo root (another game), sibling folders, other origins and non-GETs pass straight through
  assert.equal(run(`${site}/FunLand2/`, { mode: 'navigate' }), false);
  assert.equal(run(`${site}/FunLand2/index.html`, { mode: 'navigate' }), false);
  assert.equal(run(`${site}/FunLand2/src/main.js`), false);
  assert.equal(run(`${site}/FunLand2/battlefield/x.js`), false);
  assert.equal(run(`${site}/FunLand2/battle`, { mode: 'navigate' }), false);
  assert.equal(run('https://example.com/FunLand2/battle/src/main.js'), false);
  assert.equal(run(`${BASE}src/main.js`, { method: 'POST' }), false);
  // The game's own files and pages are served by the worker
  assert.equal(run(`${BASE}src/main.js`, { mode: 'cors' }), true);
  assert.equal(run(BASE, { mode: 'navigate' }), true);
  assert.equal(run(`${BASE}?pwa=1`, { mode: 'navigate' }), true);
});

test('offline page loads fall back to the cached index.html', async () => {
  const index = { url: BASE + 'index.html', redirected: false, body: 'index' };
  const s = loadSW({ hits: { [BASE + 'index.html']: index } });
  let res;
  s.listeners.fetch({ request: { url: `${BASE}?from=home`, method: 'GET', mode: 'navigate' }, respondWith: (p) => (res = p) });
  assert.equal(await res, index, 'the game URL boots from the cache');
});

test('activating a new version deletes only old Wobble War caches', async () => {
  const deleted = [];
  const s = loadSW({ cacheKeys: ['wobble-war-old', 'horde-v1', 'some-other-app', `wobble-war-${sw.VERSION}`], deleted });
  let done;
  s.listeners.activate({ waitUntil: (p) => (done = p) });
  await done;
  assert.deepEqual(deleted, ['wobble-war-old']);
});

// --- manifest + icons ---------------------------------------------------------------------------

function pngSize(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', `${file} is a PNG`);
  assert.equal(b.subarray(12, 16).toString('latin1'), 'IHDR');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

test('manifest.webmanifest has the install fields', () => {
  const m = JSON.parse(fs.readFileSync(path.join(BATTLE, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Wobble War');
  assert.equal(m.short_name, 'Wobble War');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'fullscreen');
  assert.deepEqual(m.display_override, ['fullscreen', 'standalone']);
  assert.equal(m.orientation, 'landscape');
  assert.equal(m.background_color.toLowerCase(), '#8fcbe8');
  assert.equal(m.theme_color.toLowerCase(), '#8fcbe8');
  assert.deepEqual(m.categories, ['games']);
});

test('manifest icons exist with the declared sizes (192 + 512 any, 512 maskable) and the apple-touch-icon is 180', () => {
  const m = JSON.parse(fs.readFileSync(path.join(BATTLE, 'manifest.webmanifest'), 'utf8'));
  const has = (size, purpose) => m.icons.some((i) => i.sizes === size && (i.purpose || 'any').split(' ').includes(purpose));
  assert.ok(has('192x192', 'any'), '192x192 any icon');
  assert.ok(has('512x512', 'any'), '512x512 any icon');
  assert.ok(has('512x512', 'maskable'), '512x512 maskable icon');
  for (const icon of m.icons) {
    const file = path.join(BATTLE, icon.src);
    assert.ok(fs.existsSync(file), `${icon.src} exists`);
    assert.equal(icon.type, 'image/png');
    const [w, h] = pngSize(file);
    assert.equal(`${w}x${h}`, icon.sizes, `${icon.src} is really ${icon.sizes}`);
  }
  assert.deepEqual(pngSize(path.join(BATTLE, 'icons/apple-touch-icon.png')), [180, 180]);
});

// --- src/pwa.js -----------------------------------------------------------------------------------

test('pwa.js exports its helpers and never throws outside a browser', async () => {
  const pwa = await import('../battle/src/pwa.js');
  for (const name of ['registerPWA', 'canInstall', 'promptInstall', 'isStandalone', 'installMethod', 'swVersion']) {
    assert.equal(typeof pwa[name], 'function', `exports ${name}`);
  }
  assert.equal(await pwa.registerPWA({ onUpdateReady: () => {} }), null);
  assert.equal(await pwa.registerPWA(), null);
  assert.equal(pwa.canInstall(), false);
  assert.equal(pwa.isStandalone(), false);
  assert.equal(pwa.installMethod(), 'none');
  assert.equal(await pwa.promptInstall(), 'unavailable');
  assert.equal(await pwa.swVersion(), null);
});

// --- wiring (a reminder until the page uses it, then a real check) ----------------------------

const indexHtml = fs.readFileSync(path.join(BATTLE, 'index.html'), 'utf8');
const mainJs = fs.readFileSync(path.join(BATTLE, 'src/main.js'), 'utf8');
const headWired = /rel=["']manifest["']/.test(indexHtml);
const mainWired = /from ['"]\.\/pwa\.js['"]/.test(mainJs);

test('index.html links the manifest and the apple-touch-icon', { todo: !headWired && 'add the PWA <head> snippet to battle/index.html' }, () => {
  const has = (re, what) => assert.ok(re.test(indexHtml), `battle/index.html needs ${what}`);
  has(/<link[^>]+rel=["']manifest["'][^>]+href=["']manifest\.webmanifest["']/, '<link rel="manifest" href="manifest.webmanifest">');
  has(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']icons\/apple-touch-icon\.png["']/, '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">');
  has(/<meta[^>]+name=["']theme-color["'][^>]+content=["']#8fcbe8["']/i, '<meta name="theme-color" content="#8fcbe8">');
});

test('main.js registers the service worker', { todo: !mainWired && 'import registerPWA from ./pwa.js in battle/src/main.js' }, () => {
  assert.ok(/import\s*\{[^}]*\bregisterPWA\b[^}]*\}\s*from\s*['"]\.\/pwa\.js['"]/.test(mainJs), 'battle/src/main.js imports { registerPWA } from ./pwa.js');
  assert.ok(/registerPWA\(/.test(mainJs), 'battle/src/main.js calls registerPWA(...)');
});
