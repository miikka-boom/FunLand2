# Wobble War on itch.io

The same game as `battle/` on GitHub Pages, packed as an itch.io "HTML" upload:
a zip that itch unpacks and plays in an `<iframe>` on the game's page.

## Build it

```
npm run battle:itch
# = node battle/tools/build-itch.mjs [--out <dir>] [--zip <file>]
```

By default it writes the folder `dist/itch/` and the zip `dist/wobble-war-itch.zip`
(`dist/` is git-ignored) and prints the file count, sizes and paths. Rebuild after
any change under `battle/`; the build is named after `VERSION` in `battle/sw.js`, so
bump that as usual. The same sources give a byte-identical zip.

`--out` and `--zip` may not point into `battle/`. A non-empty `--out` folder is
replaced only when every file in it was written by the build: the build lists
them in `.itch-build.json` there (a dotfile, never shipped). A folder where the zip
was unpacked next to other files is refused, so pick an empty or new folder.

The zip holds `index.html` at its root, `style.css`, `hub.css`, `icon.svg` and all
of `src/` (about 46 files, 1.4 MB, 0.4 MB zipped). It never holds `tools/`,
`sw.js`, tests or dotfiles. The build crawls every path in the shipped HTML, CSS
and JS (imports, dynamic `import()`, `new URL(..., import.meta.url)`, `url()`,
`href`/`src`, and any string that looks like a file) and fails if one does not
resolve to a shipped file with the exact case (itch's server is case-sensitive),
is absolute, or leaves the build. Two references are left out on purpose, each
with a reason, in `NOT_SHIPPED` in the tool: `src/pwa.js` → `../sw.js` and the
More screen's `../` link. `tests/battle-itch.test.js` checks all of this, reads
the zip back and builds it twice.

## What the itch build changes, and why

The source tree is not touched. The build stamps the shipped `index.html` with
`<html lang="en" data-host="itch" data-version="<VERSION>">`, and
`battle/src/host.js` reads that (`HOST`, `ITCH`). In itch mode:

- **No service worker.** itch serves every upload from a new path on an origin
  that many games share (`html-classic.itch.zone` / `html.itch.zone`). A worker
  there would keep stale copies and caches around for nothing. `registerPWA()`
  does nothing, and the game never unregisters or deletes anything on that
  origin either: none of it is ours.
- **No install.** A page in an iframe cannot be installed: the install row in
  More → Settings is gone and the install prompt is never listened for.
- **Version label.** More shows `v<VERSION>` stamped by the build (the web
  build asks its service worker).
- **No link out of the game.** The "← FunLand2 Prototype 0: HORDE" link (`../`)
  would load a broken page inside itch's iframe, so it is hidden.
- **Leaner `<head>`.** The manifest link, the apple-touch-icon and the
  (apple-)mobile-web-app tags are dropped: browsers ignore them inside an
  iframe, so `manifest.webmanifest` and `icons/` are not shipped.

Everything else is identical: the same code, save, sounds and full-screen
button (itch's iframe allows full screen). The Back button stays safe: inside
the iframe the game's history entries join the itch page's history, and the
game only keeps one while a card, a menu screen other than Battle or a match is
up, and drops it on the bare menu, so Back from there leaves the page as usual.

One case is itch-only. When the player reloads itch's page while a card or a
match is up, the browser keeps that history entry but loads the game into it
fresh, without the game's mark on it. When the game can see this (the frame's
own history in the Navigation API lists an earlier entry of the same game
page), it steps back onto that entry at once: the game loads a second time,
and the next Back on the bare menu leaves the page. Chromium shows the game
that entry only when the game's iframe is written in itch's page itself; an
iframe that a script adds afterwards (as itch's "Run game" button does) cannot
see it, so there the first Back press after such a reload changes nothing (see
Known limits).
Either way the game only ever goes back to its own entries, never off itch's
page.

## Upload settings

On the project's edit page:

- **Kind of project:** HTML.
- **Uploads:** upload the built zip (`dist/wobble-war-itch.zip` by default, or
  whatever `--zip` named; the file name does not matter to itch) and tick
  **This file will be played in the browser**. For a new version, upload the new
  zip, tick **This file will be played in the browser** on it too (without it the
  page has no game to run), then delete the old upload.
- **Embed options:**
  - Embed in page, **viewport 960 × 540** (16:9; the game is landscape and
    scales to any size).
  - **Mobile friendly** on, orientation **Landscape**.
  - **Fullscreen button** on.
  - **Automatically start on page load: off** (click to launch). Recommended:
    the game boots into a live bot-against-bot match behind the menu, which
    would cost CPU and battery for every visitor who only reads the page. (Sound
    is the same either way: it starts on the player's first tap or key press
    inside the game, a menu tap included. The launch click is on itch's page,
    outside the game, so it does not count.)
  - Enable scrollbars: off. **SharedArrayBuffer support: off** (not needed).

## Where saves live

The save is the `localStorage` key `wobblewar.profile.v1` on the origin itch
serves the game from (an `itch.zone` host, not `itch.io`).

- Uploading a new version of the same project keeps saves: the path changes,
  the origin does not.
- Saves are per browser and device. Nothing syncs, and the GitHub Pages copy
  has its own separate save.
- A private window starts fresh and forgets everything when it closes.
- Browsers keep an embedded page's storage per top-level site; one that blocks
  it entirely still runs the game, and Settings says progress can't be saved.
- The `itch.zone` origin is shared by every itch HTML game the player opens in
  that browser. Wobble War only reads and writes its own key, but another game
  that clears its storage (`localStorage.clear()`) erases this save too, and one
  that fills the origin's storage quota stops this game from saving (Settings
  then says progress can't be saved).

## Known limits

- No offline play and no "install app" on itch (the GitHub Pages build has
  both).
- Saves can be lost when the player clears site data, and some browsers (Safari
  on iPhone and iPad especially) clear an embedded site's storage after a while
  without visits.
- Inside an iframe a browser may refuse the landscape lock that the in-game
  full-screen button asks for. On a phone held upright the "turn your phone
  sideways" screen still shows.
- A new upload reaches players on their next page load (there is no worker to
  update in the background).
- If the player reloads itch's page while a card, a menu screen or a match is
  up, and the game is then started by "Run game" (or its iframe is otherwise
  added by a script), the first Back press after that changes nothing and
  the second leaves the page. The game has no way to see the entry left over
  from before the reload (see "What the itch build changes"). Nothing is lost
  and Back never gets stuck.
