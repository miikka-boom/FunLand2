// Where this copy of the game runs, decided when it was built, not at run time.
//
// The source tree (GitHub Pages, local dev servers) is the 'web' host: an installable,
// offline app with a service worker (pwa.js). The itch.io build (battle/tools/build-itch.mjs)
// stamps its index.html with <html data-host="itch" data-version="...">: the game is then
// played inside itch's <iframe> on a shared origin, so it registers no service worker, offers
// no install, and hides links that would leave the game (see docs/ITCH.md).
//
// Safe without a DOM (node tests): no document means 'web'.

/** 'itch' for a document stamped by the itch build, otherwise 'web'. */
export function hostOf(doc) {
  try {
    const de = doc && doc.documentElement;
    if (!de) return 'web';
    const v = de.dataset ? de.dataset.host : de.getAttribute && de.getAttribute('data-host');
    return v === 'itch' ? 'itch' : 'web';
  } catch {
    return 'web';
  }
}

/** The game version a build stamped into the page (data-version), or null. */
export function versionOf(doc) {
  try {
    const de = doc && doc.documentElement;
    if (!de) return null;
    const v = de.dataset ? de.dataset.version : de.getAttribute && de.getAttribute('data-version');
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/**
 * The key of this frame's own earlier history entry to step back to, or null. On itch.io, a
 * reload of itch's page while the game had a history entry pushed (a card or a match was up)
 * keeps that entry in the page's history but loads this frame into it fresh, without its
 * state: the entry under it then belongs to an earlier document of this frame, at the same URL.
 * nav: the Navigation API (window.navigation; missing in older browsers), state: history.state.
 * Only this frame's own entries are listed, so going to one never leaves itch's page.
 */
export function staleEntryKey(nav, state) {
  try {
    if (state && state.wobble) return null; // our entry with its state: main.js knows it
    const cur = nav && nav.currentEntry;
    if (!cur || !(cur.index > 0)) return null;
    const prev = nav.entries()[cur.index - 1];
    if (!prev || prev.sameDocument !== false || prev.url !== cur.url) return null;
    return typeof prev.key === 'string' && prev.key ? prev.key : null;
  } catch {
    return null;
  }
}

const doc = typeof document !== 'undefined' ? document : null;

/** 'web' | 'itch' for this page. */
export const HOST = hostOf(doc);
/** True in the itch.io build: no service worker, no install, no links that leave the game. */
export const ITCH = HOST === 'itch';
/** The version stamped by a build (the itch build stamps sw.js VERSION), or null. */
export const BUILD_VERSION = versionOf(doc);
