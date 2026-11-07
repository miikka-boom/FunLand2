// Wobble War service worker: plays offline after the first visit and updates cleanly.
//
// It lives in battle/, so it only ever controls pages under battle/ (the repo root is a
// different game). Requests for anything outside battle/ or on another origin are never
// touched, even when a battle/ page makes them.
//
// How updates work: every file below is stored in one cache named after VERSION and served
// cache-first, so the game always boots from a matching set of files, online or offline.
// Deploying a sw.js with a new VERSION makes browsers download the whole new set in the
// background; the new worker then waits until the page calls applyUpdate() (src/pwa.js),
// which switches over and reloads once. The old cache is deleted when the new one takes over.

// BUMP THIS on every deploy that changes ANY file under battle/ (code, CSS, HTML, icons).
// If it stays the same, players who already have the game keep the old files forever.
const VERSION = '2026-11-05.3';

const CACHE_PREFIX = 'wobble-war-';
const CACHE = CACHE_PREFIX + VERSION;

// The whole app shell, relative to this file. tests/battle-pwa.test.js fails when a file under
// battle/src/ or a shell file is missing here, or when an entry does not exist (a single 404
// makes the whole install fail, so the game would silently never work offline).
const PRECACHE = [
  './index.html',
  './style.css',
  './hub.css',
  './icon.svg',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './src/audio.js',
  './src/config.js',
  './src/input.js',
  './src/main.js',
  './src/meta/badges.js',
  './src/meta/chests.js',
  './src/meta/collection.js',
  './src/meta/cosmetics.js',
  './src/meta/ladder.js',
  './src/meta/opponents.js',
  './src/meta/profile.js',
  './src/meta/shop.js',
  './src/pwa.js',
  './src/render/background.js',
  './src/render/camera.js',
  './src/render/cards.js',
  './src/render/chests.js',
  './src/render/effects.js',
  './src/render/hats.js',
  './src/render/spells.js',
  './src/render/towers.js',
  './src/render/units.js',
  './src/sim/battle.js',
  './src/sim/bot.js',
  './src/sim/cards.js',
  './src/sim/match.js',
  './src/sim/physics.js',
  './src/sim/rng.js',
  './src/sim/spells.js',
  './src/sim/towers.js',
  './src/sim/unit-types.js',
  './src/sim/unit.js',
  './src/ui/cards-screen.js',
  './src/ui/chest-open.js',
  './src/ui/hub-kit.js',
  './src/ui/hub.js',
  './src/ui/more-screen.js',
  './src/ui/shop-screen.js',
  './src/ui/trail-screen.js',
];

const HERE = self.location.href;
const SCOPE = (self.registration && self.registration.scope) || new URL('./', HERE).href;
const INDEX = new URL('./index.html', HERE).href;
const INDEX_PATH = new URL(INDEX).pathname;
const SCOPE_PATH = new URL(SCOPE).pathname;

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache, so a new version never stores stale copies.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE.map((p) => new Request(new URL(p, HERE).href, { cache: 'reload' })))),
  );
  // No skipWaiting() here: a new version waits for the page to ask (see pwa.js), so files are
  // never swapped under a running battle. The very first install activates right away anyway.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Only our own old versions: other apps on this origin keep their caches.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      // Take over pages that are already open (the first visit, and pages waiting on an update).
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (data.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // DevTools quirk: this combination throws when fetched from a worker.
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
  const url = new URL(req.url);
  // Never intercept anything outside battle/ (or on another origin): the network handles it.
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  if (req.mode === 'navigate') event.respondWith(navigate(req, url));
  else event.respondWith(cacheFirst(req));
});

/** Page loads: the cached index.html for the game's own URL, the network for anything else,
 *  and the cached index.html whenever the network is unreachable. */
async function navigate(req, url) {
  const cache = await caches.open(CACHE);
  const isShell = url.pathname === SCOPE_PATH || url.pathname === INDEX_PATH;
  if (isShell) {
    const hit = await cache.match(INDEX);
    if (hit) return plain(hit);
  }
  try {
    return await fetch(req);
  } catch (err) {
    const hit = await cache.match(INDEX);
    if (hit) return plain(hit);
    throw err;
  }
}

/** Files: this version's cache first; otherwise the network (kept for offline use too). */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.status === 200 && res.type === 'basic') cache.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    // Offline: the same file under another ?query is better than nothing.
    const loose = await cache.match(req, { ignoreSearch: true });
    if (loose) return loose;
    throw err;
  }
}

/** Browsers refuse a redirected response for a navigation; serve its body as a fresh response. */
function plain(res) {
  if (!res.redirected) return res;
  return res.blob().then((body) => new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers }));
}
