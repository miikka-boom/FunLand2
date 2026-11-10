// WOBBLE WAR on itch.io: battle/tools/build-itch.mjs turns battle/ into the zip itch plays in an
// <iframe>. The build must ship only the game, every path in it must resolve with the exact case
// inside the build, the zip must read back and come out byte-identical from the same sources,
// and the itch build (host.js ITCH) must register no service worker, offer no install and show
// no link out of the game, while the source tree keeps doing all three on GitHub Pages.
// Run: node --test tests/battle-itch.test.js

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, crawl, walk, readVersion, NOT_SHIPPED, LIMITS } from '../battle/tools/build-itch.mjs';
import { hostOf, versionOf, staleEntryKey, HOST, ITCH, BUILD_VERSION } from '../battle/src/host.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BATTLE = path.join(ROOT, 'battle');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wobble-itch-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let first = null;
/** The build, run once into the temp folder. */
function built() {
  if (!first) first = build({ out: path.join(TMP, 'a'), zip: path.join(TMP, 'a.zip') });
  return first;
}

// --- a small zip reader (independent of the build's writer) -----------------------------------

let CRC = null;
function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  if (!CRC) {
    CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** Every entry of a zip: { name, method, time, date, data } (inflated, CRC and sizes checked). */
function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  assert.ok(eocd >= 0, 'the zip has an end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOff = buf.readUInt32LE(eocd + 16);
  assert.equal(buf.readUInt16LE(eocd + 8), count, 'one disk');
  assert.equal(cdOff + cdSize, eocd, 'the central directory ends where the end record starts');
  const out = [];
  let p = cdOff;
  for (let k = 0; k < count; k++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, `central header ${k}`);
    const method = buf.readUInt16LE(p + 10);
    const time = buf.readUInt16LE(p + 12);
    const date = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    // the local header says the same
    assert.equal(buf.readUInt32LE(local), 0x04034b50, `${name}: local header`);
    assert.equal(buf.readUInt16LE(local + 8), method, `${name}: method`);
    assert.equal(buf.readUInt32LE(local + 14), crc, `${name}: local CRC`);
    assert.equal(buf.readUInt32LE(local + 18), csize, `${name}: local compressed size`);
    assert.equal(buf.readUInt32LE(local + 22), usize, `${name}: local size`);
    const lnlen = buf.readUInt16LE(local + 26);
    const lxlen = buf.readUInt16LE(local + 28);
    assert.equal(buf.toString('utf8', local + 30, local + 30 + lnlen), name, `${name}: local name`);
    const start = local + 30 + lnlen + lxlen;
    const raw = buf.subarray(start, start + csize);
    assert.ok(method === 0 || method === 8, `${name}: stored or deflated (method ${method})`);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    assert.equal(data.length, usize, `${name}: size`);
    assert.equal(crc32(data), crc, `${name}: CRC-32`);
    out.push({ name, method, time, date, data });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

// --- the build ----------------------------------------------------------------------------------

test('itch build: index.html sits at the zip root and carries the itch flag; the source index.html does not', () => {
  const b = built();
  const names = readZip(fs.readFileSync(b.zip)).map((e) => e.name);
  assert.ok(names.includes('index.html'), 'index.html at the root (no wrapping folder)');
  const shipped = fs.readFileSync(path.join(b.out, 'index.html'), 'utf8');
  const version = readVersion();
  assert.equal(b.version, version, 'the build is named after sw.js VERSION');
  assert.match(shipped, new RegExp(`<html lang="en" data-host="itch" data-version="${version.replace(/\./g, '\\.')}">`));
  assert.equal(hostOf({ documentElement: { dataset: { host: 'itch' } } }), 'itch');
  const source = fs.readFileSync(path.join(BATTLE, 'index.html'), 'utf8');
  assert.doesNotMatch(source, /data-host=/, 'battle/index.html (GitHub Pages) has no host flag');
  assert.match(source, /<link rel="manifest" href="manifest\.webmanifest">/, 'the source keeps its manifest');
  // inside an iframe the install tags do nothing: the itch page drops them, keeps the rest
  for (const re of [/rel="manifest"/, /rel="apple-touch-icon"/, /apple-mobile-web-app/, /mobile-web-app-capable/]) assert.doesNotMatch(shipped, re);
  for (const re of [/href="style\.css"/, /href="hub\.css"/, /src="src\/main\.js"/, /id="game"/, /id="boot-error"/]) assert.match(shipped, re);
});

test('itch build: every reference resolves to a shipped file, exact case, inside the build', () => {
  const b = built();
  const names = walk(b.out);
  const r = crawl(b.out, { also: names });
  assert.deepEqual(r.problems, [], 'no broken references');
  assert.ok(r.refs.filter((x) => x.status === 'ok').length > 100, `the crawler followed the game (${r.refs.length} references)`);
  const unused = names.filter((f) => !r.reached.has(f));
  assert.deepEqual(unused, [], 'nothing shipped that the game never references');
  // the only references left unresolved are the reviewed ones, each hidden or unused on itch
  const omitted = r.refs.filter((x) => x.status === 'omitted').map((x) => `${x.from} -> ${x.spec}`);
  assert.deepEqual(omitted.sort(), NOT_SHIPPED.map((x) => `${x.from} -> ${x.spec}`).sort());
  for (const f of ['src/main.js', 'src/host.js', 'src/pwa.js', 'src/ui/more-screen.js', 'style.css', 'hub.css', 'icon.svg']) assert.ok(r.reached.has(f), `${f} is reached from index.html`);
});

test('the crawler catches what would break on itch: wrong case, missing files, absolute and outside paths, computed imports', () => {
  const dir = path.join(TMP, 'bad');
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  };
  put('index.html', '<!doctype html><link rel="stylesheet" href="Style.css"><link rel="stylesheet" href="ok.css"><script type="module" src="src/main.js"></script><img src="/logo.png">');
  put('style.css', 'body{}');
  put('ok.css', '@import "missing.css";\nbody { background: url(img/Logo.PNG) }\n/* url(commented-out.png) */');
  put('img/logo.png', 'x');
  put(
    'src/main.js',
    [
      "import { a } from './a.js';",
      "import { b } from './B.js';",
      "import 'bare-package';",
      "// import { c } from './commented-out.js';",
      "const re = /import x from '.\\/in-a-regex.js'/;",
      "const s = \"import y from './in-a-string.js'\";",
      'const m = await import(`./${a}.js`);',
      "const u = new URL('../../up.png', import.meta.url);",
      "fetch('/data.json');",
      "el.append(h('a', { href: 'https://example.com/' }, 'away'));",
      "this.src = 'hand';",
      "const art = 'art/missing.png';",
    ].join('\n'),
  );
  put('src/a.js', 'export const a = 1;');
  put('src/b.js', 'export const b = 2;');
  const r = crawl(dir, { notShipped: [{ from: 'src/gone.js', spec: '../', why: 'test' }] });
  const has = (re) => assert.ok(r.problems.some((p) => re.test(p)), `a problem matching ${re}\n${r.problems.join('\n')}`);
  has(/index\.html:1: .*"Style\.css" resolves to Style\.css, which is not in the build with that exact case/);
  has(/index\.html:1: .*"\/logo\.png" is root-absolute/);
  has(/ok\.css:1: @import "missing\.css"/);
  has(/ok\.css:2: url\(\) "img\/Logo\.PNG" resolves to img\/Logo\.PNG/);
  has(/src\/main\.js:2: import "\.\/B\.js"/);
  has(/src\/main\.js:3: import "bare-package" is a bare module specifier/);
  has(/src\/main\.js:7: import\(\) with a computed path/);
  has(/src\/main\.js:8: .*"\.\.\/\.\.\/up\.png" leaves the build root/);
  has(/src\/main\.js:9: .*"\/data\.json" is root-absolute/);
  has(/src\/main\.js:10: .*"https:\/\/example\.com\/" points off the build/);
  has(/src\/main\.js:12: asset path string "art\/missing\.png"/);
  has(/NOT_SHIPPED lists src\/gone\.js/);
  for (const quiet of ['commented-out', 'in-a-regex', 'in-a-string', '"hand"']) assert.ok(!r.problems.some((p) => p.includes(quiet)), `no false alarm for ${quiet}`);
  assert.equal(r.problems.length, 12, r.problems.join('\n'));
  assert.ok(r.reached.has('src/a.js') && r.reached.has('ok.css'), 'good references are followed');
});

test('itch build: only the game ships (no tools, worker, tests or dotfiles), well under itch limits', () => {
  const b = built();
  const names = walk(b.out);
  assert.deepEqual(
    b.files.map((f) => f.name),
    names,
  );
  for (const f of names) {
    assert.ok(!/^tools\//.test(f), `${f}: no tools/`);
    assert.ok(!/(^|\/)tests?\//.test(f) && !/\.test\.m?js$/.test(f), `${f}: no tests`);
    assert.ok(!f.split('/').some((s) => s.startsWith('.')), `${f}: no dotfiles`);
  }
  assert.ok(!names.includes('sw.js'), 'no service worker');
  assert.ok(!names.includes('manifest.webmanifest'), 'no manifest (the itch page does not link it)');
  const src = walk(path.join(BATTLE, 'src')).map((f) => 'src/' + f);
  assert.deepEqual(
    names.filter((f) => f.startsWith('src/')),
    src,
    'every file of battle/src ships, and nothing else under src/',
  );
  for (const f of ['index.html', 'style.css', 'hub.css', 'icon.svg']) assert.ok(names.includes(f), `${f} ships`);
  assert.ok(names.length < LIMITS.files, `${names.length} files (itch: at most ${LIMITS.files})`);
  assert.ok(b.bytes < LIMITS.bytes, 'under 500 MB extracted');
  // every file the zip holds is a plain relative path itch can serve
  for (const f of names) assert.match(f, /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/);
});

test('itch build: the zip reads back (inflate + CRC-32) and holds exactly the files on disk', () => {
  const b = built();
  const buf = fs.readFileSync(b.zip);
  assert.equal(buf.length, b.zipBytes);
  const entries = readZip(buf);
  const names = entries.map((e) => e.name);
  assert.deepEqual(names, walk(b.out), 'the same files, sorted');
  assert.deepEqual(names, [...names].sort(), 'entries are sorted');
  for (const e of entries) {
    assert.ok(!e.name.includes('\\') && !e.name.startsWith('/') && !e.name.endsWith('/'), `${e.name}: a forward-slash file entry`);
    assert.ok(e.data.equals(fs.readFileSync(path.join(b.out, e.name))), `${e.name}: same bytes as the built file`);
    assert.equal(e.time, entries[0].time, 'one fixed timestamp');
    assert.equal(e.date, entries[0].date, 'one fixed date');
  }
  assert.ok(entries.some((e) => e.method === 8), 'files are deflated');
  // (optional) the system unzip agrees, where there is one
  let unzip = null;
  try {
    unzip = execFileSync('unzip', ['-t', b.zip], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (unzip) assert.match(unzip, /No errors detected/);
});

test('itch build: two builds give byte-identical zips', () => {
  const b = built();
  const again = build({ out: path.join(TMP, 'b'), zip: path.join(TMP, 'b.zip') });
  assert.ok(fs.readFileSync(b.zip).equals(fs.readFileSync(again.zip)), 'same bytes');
  // and a rebuild over an earlier build's folder is fine
  const third = build({ out: path.join(TMP, 'b'), zip: path.join(TMP, 'b.zip') });
  assert.equal(third.zipBytes, b.zipBytes);
});

test('the build refuses to wipe a folder that is not an earlier itch build, or the source', () => {
  const dir = path.join(TMP, 'precious');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
  assert.throws(() => build({ out: dir, zip: path.join(TMP, 'x.zip') }), /holds files this build did not write: notes\.txt/);
  assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'keep me');
  assert.throws(() => build({ out: ROOT, zip: path.join(TMP, 'x.zip') }), /holds the game's source/);
  assert.throws(() => build({ out: path.join(BATTLE, 'itch'), zip: path.join(TMP, 'x.zip') }), /inside battle\//);
  assert.throws(() => build({ out: path.join(TMP, 'c'), zip: path.join(TMP, 'c', 'game.zip') }), /cannot go inside --out/);
  // the zip must not land in the source either: everything under src/ ships, so it would ride along
  const inSrc = path.join(BATTLE, 'src', 'game.zip');
  try {
    assert.throws(() => build({ out: path.join(TMP, 'c'), zip: inSrc }), /zip cannot go inside battle\//);
    assert.ok(!fs.existsSync(inSrc), 'nothing written into the source');
    // ...nor through a symlink to it (where the system lets us make one)
    const link = path.join(TMP, 'battle-link');
    let linked = false;
    try {
      fs.symlinkSync(BATTLE, link, 'dir');
      linked = true;
    } catch {}
    if (linked) {
      assert.throws(() => build({ out: path.join(TMP, 'c'), zip: path.join(link, 'src', 'game.zip') }), /zip cannot go inside battle\//);
      assert.throws(() => build({ out: path.join(link, 'dist'), zip: path.join(TMP, 'x.zip') }), /inside battle\//);
      fs.unlinkSync(link);
    }
    assert.ok(!fs.existsSync(inSrc), 'nothing written into the source through the link');
  } finally {
    fs.rmSync(inSrc, { force: true }); // (only there if the check above failed)
    fs.rmSync(path.join(BATTLE, 'dist'), { recursive: true, force: true });
  }
});

test('the build refuses a folder where the zip was unpacked next to other files (an itch index.html is not enough)', () => {
  const b = built();
  // the zip has no wrapping folder, so unpacking it in Downloads puts index.html among the player's files
  const dir = path.join(TMP, 'downloads');
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me');
  fs.writeFileSync(path.join(dir, 'photos', 'cat.jpg'), 'jpg');
  fs.cpSync(b.out, dir, { recursive: true, filter: (p) => !path.basename(p).startsWith('.') });
  assert.match(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), /data-host="itch"/);
  assert.throws(() => build({ out: dir, zip: path.join(TMP, 'dl.zip') }), /holds files this build did not write: notes\.txt, photos\/cat\.jpg/);
  assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'keep me');
  assert.equal(fs.readFileSync(path.join(dir, 'photos', 'cat.jpg'), 'utf8'), 'jpg');
  assert.ok(fs.existsSync(path.join(dir, 'src', 'main.js')), 'nothing was removed');
  // also a stray file inside src/ of an earlier build
  const again = path.join(TMP, 'stray');
  build({ out: again, zip: null });
  fs.writeFileSync(path.join(again, 'src', 'mine.js'), '// mine');
  assert.throws(() => build({ out: again, zip: null }), /did not write: src\/mine\.js/);
  assert.ok(fs.existsSync(path.join(again, 'src', 'mine.js')));
  // an earlier build that shipped a file the game no longer has is still ours to replace
  fs.rmSync(path.join(again, 'src', 'mine.js'));
  const manifest = path.join(again, '.itch-build.json');
  const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  m.files.push('src/old-module.js');
  fs.writeFileSync(manifest, JSON.stringify(m));
  fs.writeFileSync(path.join(again, 'src', 'old-module.js'), '// gone from battle/src');
  build({ out: again, zip: null });
  assert.ok(!fs.existsSync(path.join(again, 'src', 'old-module.js')), 'replaced by the new build');
});

test('the build CLI runs when started through a symlinked path', (t) => {
  const link = path.join(TMP, 'tools-link');
  try {
    fs.symlinkSync(path.join(BATTLE, 'tools'), link, 'dir');
  } catch (err) {
    t.skip(`no symlinks here (${err.code})`);
    return;
  }
  const outText = execFileSync(process.execPath, [path.join(link, 'build-itch.mjs'), '--help'], { encoding: 'utf8', cwd: os.tmpdir() });
  assert.match(outText, /^usage: node battle\/tools\/build-itch\.mjs/);
});

// --- itch mode in the game ----------------------------------------------------------------------

test('host.js: itch only for a page the itch build stamped; web everywhere else (and under node)', () => {
  assert.equal(hostOf({ documentElement: { dataset: { host: 'itch' } } }), 'itch');
  assert.equal(hostOf({ documentElement: { dataset: {} } }), 'web');
  assert.equal(hostOf({ documentElement: { dataset: { host: 'ITCH' } } }), 'web', 'exact value only');
  assert.equal(hostOf({ documentElement: { getAttribute: (k) => (k === 'data-host' ? 'itch' : null) } }), 'itch', 'works without dataset');
  assert.equal(hostOf(null), 'web');
  assert.equal(hostOf({}), 'web');
  assert.equal(
    hostOf({
      get documentElement() {
        throw new Error('no');
      },
    }),
    'web',
  );
  assert.equal(versionOf({ documentElement: { dataset: { host: 'itch', version: '2026-11-10.3' } } }), '2026-11-10.3');
  assert.equal(versionOf({ documentElement: { dataset: {} } }), null);
  assert.equal(HOST, 'web');
  assert.equal(ITCH, false);
  assert.equal(BUILD_VERSION, null);
});

/**
 * Loads pwa.js and the More screen in a fresh node process with a tiny fake browser (an https
 * page, a service worker API that records register(), a DOM just big enough for hub-kit's h()),
 * stamped for itch or not, and reports what the game did.
 */
function runGame(itch) {
  const url = (p) => pathToFileURL(path.join(BATTLE, p)).href;
  const code = `
    const itch = ${itch ? 'true' : 'false'};
    class El {
      constructor(tag) { this.tagName = tag.toUpperCase(); this.nodeType = 1; this.kids = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.className = ''; this._html = ''; }
      setAttribute(k, v) { this.attrs[k] = String(v); }
      getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
      addEventListener() {}
      removeEventListener() {}
      append(...ks) { for (const k of ks) this.kids.push(k && k.nodeType ? k : { nodeType: 3, textContent: String(k) }); }
      appendChild(k) { this.append(k); return k; }
      set innerHTML(v) { this.kids = []; this._html = String(v); }
      get innerHTML() { return this._html; }
      set textContent(v) { this.kids = [{ nodeType: 3, textContent: String(v) }]; }
      get textContent() { return this.kids.map((k) => k.textContent).join(''); }
      get classList() { return { add() {}, remove() {}, toggle() {}, contains: () => false }; }
      getContext() { return null; }
    }
    const html = new El('html');
    if (itch) html.dataset = { host: 'itch', version: '9.9.9-test' };
    const registered = [];
    const winEvents = [];
    const reg = { installing: null, waiting: null, active: null, addEventListener() {}, update: async () => {} };
    const nav = {
      userAgent: 'node', platform: 'Linux', maxTouchPoints: 0,
      serviceWorker: { controller: null, addEventListener() {}, getRegistration: async () => null, register: async (u) => (registered.push(String(u)), reg) },
    };
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
    globalThis.window = { navigator: nav, addEventListener: (t) => winEvents.push(t), matchMedia: () => ({ matches: false }), devicePixelRatio: 1, innerWidth: 960, innerHeight: 540 };
    globalThis.document = {
      documentElement: html, readyState: 'complete', visibilityState: 'visible', fullscreenElement: null,
      createElement: (t) => new El(t), createTextNode: (t) => ({ nodeType: 3, textContent: String(t) }), addEventListener() {},
    };
    globalThis.location = { protocol: 'https:', hostname: itch ? 'html-classic.itch.zone' : 'example.github.io', search: '', href: 'https://example/' };
    const host = await import(${JSON.stringify(url('src/host.js'))});
    const pwa = await import(${JSON.stringify(url('src/pwa.js'))});
    const { createMoreScreen } = await import(${JSON.stringify(url('src/ui/more-screen.js'))});
    const { newProfile } = await import(${JSON.stringify(url('src/meta/profile.js'))});
    const r = { host: host.HOST, itch: host.ITCH };
    r.reg = (await pwa.registerPWA({ onUpdateReady() {}, onInstallChange() {} })) ? 'registration' : null;
    r.registered = registered;
    r.installListener = winEvents.includes('beforeinstallprompt');
    r.installMethod = pwa.installMethod();
    r.canInstall = pwa.canInstall();
    r.promptInstall = await pwa.promptInstall();
    r.swVersion = await pwa.swVersion(20);
    const noop = () => {};
    const H = {
      P: newProfile(), tap: (fn) => fn, sfx: noop, haptic: noop, toast: noop, persist: noop, refreshChrome: noop, go: noop,
      current: () => 'more', saveOk: () => true,
      actions: { installMethod: () => 'prompt', installApp: noop, setSetting: noop, sandbox: noop, resetProgress: noop },
    };
    const more = createMoreScreen(H);
    more.section('settings');
    more.render();
    await new Promise((res) => setTimeout(res, 30)); // (the version label waits for swVersion)
    const all = [];
    const walk = (n) => { if (n && n.nodeType === 1) { all.push(n); n.kids.forEach(walk); } };
    walk(more.el);
    r.links = all.filter((n) => n.tagName === 'A').map((n) => n.getAttribute('href'));
    r.text = more.el.textContent;
    r.version = (all.find((n) => /hb-version/.test(n.className)) || {}).textContent;
    console.log(JSON.stringify(r));
    process.exit(0);
  `;
  const outText = execFileSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', cwd: ROOT });
  return JSON.parse(outText.trim().split('\n').pop());
}

test('itch mode: pwa.js registers no service worker and offers no install; the web page still does both', () => {
  const itch = runGame(true);
  assert.equal(itch.host, 'itch');
  assert.equal(itch.reg, null, 'registerPWA resolves to null');
  assert.deepEqual(itch.registered, [], 'navigator.serviceWorker.register() is never called');
  assert.equal(itch.installListener, false, 'no beforeinstallprompt listener');
  assert.equal(itch.installMethod, 'none');
  assert.equal(itch.canInstall, false);
  assert.equal(itch.promptInstall, 'unavailable');
  assert.equal(itch.swVersion, '9.9.9-test', 'the version is the one the build stamped');

  const web = runGame(false);
  assert.equal(web.host, 'web');
  assert.equal(web.reg, 'registration', 'the web page registers its worker');
  assert.equal(web.registered.length, 1);
  assert.match(web.registered[0], /\/battle\/sw\.js$/);
  assert.equal(web.installListener, true, 'the web page listens for the install prompt');
  assert.equal(web.swVersion, null, '(no worker controls this fake page yet)');
});

test('itch mode: the More screen shows no install row and no link out of the game; the web page keeps both', () => {
  const itch = runGame(true);
  assert.deepEqual(itch.links, [], 'no HORDE link (it would load a broken page into the iframe)');
  assert.doesNotMatch(itch.text, /install|home screen|HORDE/i);
  assert.match(itch.text, /Reset progress/, 'the rest of Settings is there');
  assert.doesNotMatch(itch.text, /null/, 'no stray "null" text');
  assert.equal(itch.version, 'Wobble War: Arena · v9.9.9-test');

  const web = runGame(false);
  assert.deepEqual(web.links, ['../']);
  assert.match(web.text, /Install on home screen/);
  assert.match(web.text, /HORDE/);
  assert.doesNotMatch(web.text, /null/, 'no stray "null" text');
  assert.equal(web.version, 'Wobble War: Arena · dev build');
});

test('host.js staleEntryKey: after itch reloads its page, step back only to this frame\'s own earlier entry', () => {
  const URL_ = 'https://html-classic.itch.zone/html/123/index.html';
  const nav = (entries, index) => ({ currentEntry: entries[index], entries: () => entries });
  const e = (key, index, sameDocument, url = URL_) => ({ key, index, sameDocument, url });
  // the reload loaded this frame into the entry it had pushed: the one under it is another document
  assert.equal(staleEntryKey(nav([e('a', 0, false), e('b', 1, true)], 1), null), 'a');
  // nothing to do: the frame's first entry, our own pushed entry with its state, or one of this document
  assert.equal(staleEntryKey(nav([e('a', 0, true)], 0), null), null);
  assert.equal(staleEntryKey(nav([e('a', 0, false), e('b', 1, true)], 1), { wobble: 1 }), null);
  assert.equal(staleEntryKey(nav([e('a', 0, true), e('b', 1, true)], 1), null), null);
  // another page in this frame (e.g. itch swapped the upload): never go back to it
  assert.equal(staleEntryKey(nav([e('a', 0, false, 'https://html-classic.itch.zone/html/122/index.html'), e('b', 1, true)], 1), null), null);
  // no Navigation API (older browsers), or one that throws: do nothing
  assert.equal(staleEntryKey(undefined, null), null);
  assert.equal(staleEntryKey({ currentEntry: null, entries: () => [] }, null), null);
  assert.equal(
    staleEntryKey(
      {
        get currentEntry() {
          throw new Error('no');
        },
      },
      null,
    ),
    null,
  );
  // main.js asks only in the itch build, and only when history.state is not its own
  const main = fs.readFileSync(path.join(BATTLE, 'src/main.js'), 'utf8');
  assert.match(main, /if \(history\.state && history\.state\.wobble\) backArmed = backWanted = true;\n[^\n]*\n\s*else if \(ITCH\) leaveStaleEntry\(\);/);
  assert.match(main, /navigation\.traverseTo\(key\)/, 'goes to that entry by key (never a relative step that could leave itch)');
});

test('the first tap or key anywhere starts the sound, and an embedded game takes the keyboard focus on a click', () => {
  const main = fs.readFileSync(path.join(BATTLE, 'src/main.js'), 'utf8');
  const m = /window\.addEventListener\(\s*'pointerdown',\s*\(\) => \{([\s\S]*?)\n  \},\s*\{ capture: true, passive: true \},\s*\);/.exec(main);
  assert.ok(m, 'a capture-phase pointerdown listener on window');
  assert.match(m[1], /wakeAudio\(\);/, 'starts the sound (menus, tabs and chests play sound after the first tap)');
  assert.match(m[1], /if \(window\.parent !== window && !document\.hasFocus\(\)\) window\.focus\(\);/, 'focuses the frame when embedded');
  // (a touch is a gesture only when it lifts; keys count too)
  assert.match(main, /window\.addEventListener\('pointerup', wakeAudio, \{ capture: true, passive: true \}\);/);
  assert.match(main, /window\.addEventListener\('keydown', wakeAudio, \{ capture: true, passive: true \}\);/);
  assert.match(main, /function wakeAudio\(\) \{\n\s*if \(!audio\.ctx \|\| audio\.ctx\.state !== 'running'\) audio\.unlock\(\);\n\}/);
});

test('the back button: main.js only pushes a history entry off the bare hub (itch shares the page history)', () => {
  const main = fs.readFileSync(path.join(BATTLE, 'src/main.js'), 'utf8');
  const pushes = main.match(/history\.pushState\(/g) || [];
  assert.equal(pushes.length, 1, 'one pushState, in syncBack()');
  assert.match(main, /if \(backWanted && !backArmed\) \{\s*history\.pushState/, 'pushed only when wanted and not already there');
  assert.match(main, /else if \(name === 'hub' && !playing\(\)\) disarmBack\(\);/, 'the bare hub drops the entry');
  assert.doesNotMatch(main, /history\.(go|forward)\(/);
});
