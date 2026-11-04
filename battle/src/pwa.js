// Wobble War as an installable, offline app (PWA): registers ../sw.js, hands the game a
// one-call applyUpdate() when a new version has downloaded, and wraps "Add to Home Screen".
// Everything here is best effort and never throws: the game runs the same without it.
//
// Local dev servers (localhost, 127.0.0.1) get no service worker by default, so edits show up
// on a plain reload. Add ?pwa=1 to the URL (or pass allowLocalhost) to test the PWA locally,
// and ?pwa=0 anywhere to remove the worker and its caches from this browser.

const SW_URL = new URL('../sw.js', import.meta.url).href;
const SCOPE = new URL('../', import.meta.url).href;
const CACHE_PREFIX = 'wobble-war-';

const updateListeners = new Set();
const installListeners = new Set();
const offered = new WeakSet();
let started = null;
let deferredPrompt = null;
let pendingApply = null; // applyUpdate for a downloaded version, until the page reloads

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
const safe = (fn, ...args) => {
  try {
    return fn(...args);
  } catch (err) {
    return undefined;
  }
};

// --- install ("Add to Home Screen") ---------------------------------------------------------

function matches(q) {
  return !!safe(() => window.matchMedia && window.matchMedia(q).matches);
}

function standaloneNow() {
  if (!hasWindow) return false;
  if (safe(() => window.navigator.standalone === true)) return true; // iOS home-screen app
  if (matches('(display-mode: standalone)')) return true;
  // A browser tab in element fullscreen (Fullscreen API) also matches display-mode: fullscreen.
  const fsApi = safe(() => !!(document.fullscreenElement || document.webkitFullscreenElement));
  return matches('(display-mode: fullscreen)') && !fsApi;
}

// Decided at startup, before the game can request element fullscreen.
const launchedStandalone = safe(standaloneNow) || false;

/** True when running as an installed app (home-screen icon), not in a browser tab. */
export function isStandalone() {
  return launchedStandalone || !!safe(standaloneNow);
}

/** True when the browser offers its own install prompt (Android / desktop Chrome, Edge...). */
export function canInstall() {
  return !!deferredPrompt && !isStandalone();
}

/** Shows the browser's install prompt. Call it from a tap/click handler.
 *  Resolves to 'accepted', 'dismissed' or 'unavailable'; never rejects. */
export async function promptInstall() {
  const e = deferredPrompt;
  if (!e) return 'unavailable';
  deferredPrompt = null; // each prompt event can be used once
  emitInstall();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch (err) {
    return 'unavailable';
  }
}

/** How this player could install the game right now:
 *  'installed'  already running from the home screen,
 *  'prompt'     promptInstall() shows the browser's install dialog,
 *  'ios'        iPhone/iPad: Share button, then "Add to Home Screen" (there is no prompt API),
 *  'none'       not possible from here (or the browser keeps it in its own menu). */
export function installMethod() {
  if (isStandalone()) return 'installed';
  if (canInstall()) return 'prompt';
  const ios = safe(() => {
    const n = window.navigator;
    return /iPad|iPhone|iPod/.test(n.userAgent || '') || (n.platform === 'MacIntel' && n.maxTouchPoints > 1);
  });
  return ios ? 'ios' : 'none';
}

function emitInstall() {
  const can = canInstall();
  for (const fn of installListeners) safe(fn, can);
}

// Listen from the moment the module loads: the browser fires this once, early.
if (hasWindow) {
  safe(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // no automatic mini-infobar: the game offers install at a calm moment
      deferredPrompt = e;
      emitInstall();
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      emitInstall();
    });
  });
}

// --- service worker -----------------------------------------------------------------------------

/**
 * Registers the service worker (http(s) only, never file://) so the game installs and plays
 * offline. When a new version has finished downloading, calls onUpdateReady(applyUpdate);
 * applyUpdate() switches to it and reloads the page once. Call it at a calm moment (not
 * mid-battle). onInstallChange(canInstall) fires when the browser's install prompt becomes
 * available or goes away. Resolves to the ServiceWorkerRegistration or null; never rejects.
 */
export function registerPWA({ onUpdateReady, onInstallChange, allowLocalhost = false } = {}) {
  if (typeof onUpdateReady === 'function') {
    updateListeners.add(onUpdateReady);
    if (pendingApply) safe(onUpdateReady, pendingApply);
  }
  if (typeof onInstallChange === 'function') {
    installListeners.add(onInstallChange);
    if (canInstall()) safe(onInstallChange, true);
  }
  if (!started) started = start(allowLocalhost).catch(() => null);
  return started;
}

/** The VERSION of the service worker controlling this page, or null (no worker, offline test...). */
export function swVersion(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sw = hasWindow && safe(() => navigator.serviceWorker && navigator.serviceWorker.controller);
    if (!sw || typeof MessageChannel === 'undefined') return resolve(null);
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve(null), timeoutMs);
    ch.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve((e.data && e.data.version) || null);
    };
    safe(() => sw.postMessage({ type: 'GET_VERSION' }, [ch.port2]));
  });
}

async function start(allowLocalhost) {
  if (!hasWindow || !('serviceWorker' in navigator)) return null;
  if (!/^https?:$/.test(location.protocol)) return null;
  const flag = safe(() => new URLSearchParams(location.search).get('pwa'));
  if (flag === '0' || (isDevHost() && !allowLocalhost && flag !== '1')) {
    await removeWorker();
    return null;
  }
  // Let the game load first: the worker downloads the whole app in the background.
  if (document.readyState !== 'complete') await new Promise((r) => window.addEventListener('load', r, { once: true }));
  const sw = navigator.serviceWorker;
  const reg = await sw.register(SW_URL, { scope: SCOPE, updateViaCache: 'none' });
  const track = (w) => w && w.addEventListener('statechange', () => w.state === 'installed' && offer(reg, w));
  // A new version may already be downloading (the page load itself checks), or already waiting.
  track(reg.installing);
  offerWaiting(reg);
  reg.addEventListener('updatefound', () => track(reg.installing));
  // Ask for a new version now (one small sw.js request), not only on the browser's own schedule.
  if (reg.active) reg.update().catch(() => {});
  // Installed apps can stay open for days: look for a new version when the player comes back.
  let last = Date.now();
  const check = () => {
    if (Date.now() - last < 10 * 60 * 1000) return;
    last = Date.now();
    reg.update().catch(() => {});
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
  setInterval(check, 60 * 60 * 1000);
  return reg;
}

function offerWaiting(reg) {
  if (reg.waiting) offer(reg, reg.waiting);
}

/** A new worker finished installing. Only an *update* counts: the very first install
 *  (no active worker yet) just takes over quietly. */
function offer(reg, worker) {
  if (!reg.active || reg.active === worker || offered.has(worker)) return;
  offered.add(worker);
  let applying = false;
  const applyUpdate = () => {
    if (applying) return;
    applying = true;
    safe(() => {
      let done = false;
      const reload = () => {
        if (done) return;
        done = true;
        location.reload();
      };
      // Reload once the new worker controls this page (or has activated, if it never did).
      navigator.serviceWorker.addEventListener('controllerchange', reload);
      const target = reg.waiting || worker;
      if (target.state === 'activated' || target.state === 'redundant') return reload();
      target.addEventListener('statechange', () => target.state === 'activated' && reload());
      target.postMessage({ type: 'SKIP_WAITING' });
    });
  };
  pendingApply = applyUpdate;
  for (const fn of updateListeners) safe(fn, applyUpdate);
}

function isDevHost() {
  const h = safe(() => location.hostname) || '';
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || h.endsWith('.localhost');
}

/** Unregisters this game's worker (only ours) and deletes its caches. */
async function removeWorker() {
  try {
    const reg = await navigator.serviceWorker.getRegistration(SCOPE);
    if (reg && reg.scope === SCOPE) await reg.unregister();
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX)).map((k) => caches.delete(k)));
    }
  } catch (err) {
    // best effort
  }
}
