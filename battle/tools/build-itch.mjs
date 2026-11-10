#!/usr/bin/env node
// Wobble War: the itch.io "HTML" build (a zip that itch plays in an <iframe> on the game page).
//
//   node battle/tools/build-itch.mjs [--out <dir>] [--zip <file>]      (npm run battle:itch)
//
// Defaults: dist/itch/ and dist/wobble-war-itch.zip at the repo root (dist/ is git-ignored).
// The source tree is not touched and still runs as-is on GitHub Pages. The build:
//   1. copies what the game needs: index.html (stamped <html data-host="itch" data-version>,
//      without the manifest and home-screen tags that only matter to an installed app),
//      style.css, hub.css, icon.svg, src/**, and any other file those reference;
//      never tools/, sw.js, tests or dotfiles;
//   2. crawls every reference in the shipped HTML, CSS and JS (see crawl() below) and fails
//      if one does not resolve to a shipped file with the exact case, or leaves the build;
//   3. writes the zip itself (node:zlib deflate + a small zip writer): index.html at the
//      root, sorted entries, a fixed timestamp, so the same sources give the same bytes.
// A non-empty --out is replaced only when every file in it is one this build writes or one an
// earlier build listed in its .itch-build.json (never shipped); neither path may be in battle/.
// Node built-ins only. docs/ITCH.md has the upload settings.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BATTLE = path.resolve(HERE, '..');
export const REPO = path.resolve(BATTLE, '..');

/** Always shipped (paths relative to battle/). Anything they reference is shipped too. */
const SHIP = ['index.html', 'style.css', 'hub.css', 'icon.svg'];
const SHIP_TREES = ['src'];
/** Never shipped, even when referenced (a reference to one fails the build). */
const NEVER = [/^tools\//, /^sw\.js$/, /^tests?\//, /(^|\/)\./, /\.test\.m?js$/];

/**
 * References the crawler finds that are left out ON PURPOSE. Each one must still be found
 * (a stale entry fails the build too), so a new link out of the game is never waved through.
 */
export const NOT_SHIPPED = [
  { from: 'src/pwa.js', spec: '../sw.js', why: 'the service worker: pwa.js never registers it in the itch build (host.js ITCH)' },
  { from: 'src/ui/more-screen.js', spec: '../', why: 'the FunLand2 HORDE link: more-screen.js hides it in the itch build' },
];

// itch.io HTML5 limits (docs/ITCH.md)
export const LIMITS = { files: 1000, bytes: 500 * 1024 * 1024, fileBytes: 200 * 1024 * 1024 };

// --- index.html -------------------------------------------------------------------------------

/** The game version: sw.js VERSION (bumped on every change under battle/). */
export function readVersion(battleDir = BATTLE) {
  const sw = fs.readFileSync(path.join(battleDir, 'sw.js'), 'utf8');
  const m = /^const VERSION = '([\w.-]+)';/m.exec(sw);
  if (!m) throw new Error('build-itch: no VERSION in battle/sw.js');
  return m[1];
}

/**
 * battle/index.html as the itch build ships it: the host flag and version on <html>, and no
 * manifest / home-screen tags (inside an iframe the browser ignores them: only a top-level page
 * can be installed). Every edit must apply exactly once, so a changed index.html fails loudly.
 */
export function itchIndex(html, version) {
  if (!/^[\w.-]+$/.test(version)) throw new Error(`build-itch: bad version "${version}"`);
  const edits = [
    [/<html lang="en">/g, `<html lang="en" data-host="itch" data-version="${version}">`, 'the <html lang="en"> tag'],
    [/(<meta charset="utf-8">)/g, `$1\n  <!-- itch.io build ${version}, made by battle/tools/build-itch.mjs from battle/index.html: edit that one -->`, 'the charset meta'],
    [/\n[ \t]*<meta name="mobile-web-app-capable" content="yes">/g, '', 'mobile-web-app-capable'],
    [/\n[ \t]*<meta name="apple-mobile-web-app-capable" content="yes">/g, '', 'apple-mobile-web-app-capable'],
    [/\n[ \t]*<meta name="apple-mobile-web-app-status-bar-style" content="[^"]*">/g, '', 'apple-mobile-web-app-status-bar-style'],
    [/\n[ \t]*<meta name="apple-mobile-web-app-title" content="[^"]*">/g, '', 'apple-mobile-web-app-title'],
    [/\n[ \t]*<link rel="manifest" href="manifest\.webmanifest">/g, '', 'the manifest link'],
    [/\n[ \t]*<link rel="apple-touch-icon" href="[^"]*">/g, '', 'the apple-touch-icon link'],
  ];
  let out = html;
  for (const [re, to, what] of edits) {
    const n = (out.match(re) || []).length;
    if (n !== 1) throw new Error(`build-itch: battle/index.html should have ${what} exactly once (found ${n}): update itchIndex()`);
    out = out.replace(re, to);
  }
  return out;
}

// --- reference crawler ------------------------------------------------------------------------

const REGEX_BEFORE = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const FILL = '§';

/**
 * A small JS lexer: the code with comments blanked and every string / template literal's
 * contents replaced by FILL (same length, so offsets and line numbers still match), plus each
 * literal by its start offset: { value, computed } (computed: a template with ${...}).
 */
export function lexJs(code) {
  const out = code.split('');
  const strings = new Map();
  const n = code.length;
  let prev = ''; // last significant token: punctuation char, keyword, or 'x' (a value)
  const blank = (a, b, keepNl) => {
    for (let k = a; k < b; k++) if (!(keepNl && code[k] === '\n')) out[k] = ' ';
  };
  const fill = (a, b) => {
    for (let k = a; k < b; k++) out[k] = FILL;
  };
  /** End offset (after the closing quote) of a ' or " string starting at i. */
  const endQuote = (i) => {
    const q = code[i];
    let k = i + 1;
    while (k < n && code[k] !== q && code[k] !== '\n') k += code[k] === '\\' ? 2 : 1;
    return Math.min(n, k + 1);
  };
  /** End offset of a template starting at i, and whether it has ${...}. */
  const endTemplate = (i) => {
    let k = i + 1;
    let computed = false;
    while (k < n && code[k] !== '`') {
      if (code[k] === '\\') k += 2;
      else if (code[k] === '$' && code[k + 1] === '{') {
        computed = true;
        let depth = 1;
        k += 2;
        while (k < n && depth > 0) {
          const c = code[k];
          if (c === "'" || c === '"') k = endQuote(k);
          else if (c === '`') k = endTemplate(k).end;
          else {
            if (c === '{') depth++;
            else if (c === '}') depth--;
            k++;
          }
        }
      } else k++;
    }
    return { end: Math.min(n, k + 1), computed };
  };
  const unescape = (s) => s.replace(/\\(.)/g, (m, c) => ({ n: '\n', t: '\t', r: '\r', 0: '\0' })[c] ?? c);
  let i = 0;
  while (i < n) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      const e = code.indexOf('\n', i);
      const end = e < 0 ? n : e;
      blank(i, end);
      i = end;
    } else if (c === '/' && code[i + 1] === '*') {
      const e = code.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      blank(i, end, true);
      i = end;
    } else if (c === "'" || c === '"') {
      const end = endQuote(i);
      strings.set(i, { value: unescape(code.slice(i + 1, end - 1)), computed: false, end });
      fill(i + 1, end - 1);
      prev = 'x';
      i = end;
    } else if (c === '`') {
      const { end, computed } = endTemplate(i);
      strings.set(i, { value: computed ? null : unescape(code.slice(i + 1, end - 1)), computed, end });
      fill(i + 1, end - 1);
      prev = 'x';
      i = end;
    } else if (c === '/') {
      if (prev === '' || /^[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || REGEX_BEFORE.has(prev)) {
        // a regex literal: blank its body (it may hold quotes or "import")
        let k = i + 1;
        let cls = false;
        while (k < n && code[k] !== '\n') {
          if (code[k] === '\\') k += 2;
          else {
            if (code[k] === '[') cls = true;
            else if (code[k] === ']') cls = false;
            else if (code[k] === '/' && !cls) break;
            k++;
          }
        }
        blank(i + 1, Math.min(k, n));
        k++;
        while (k < n && /[a-z]/i.test(code[k])) k++;
        prev = 'x';
        i = k;
      } else {
        prev = '/';
        i++;
      }
    } else if (/[A-Za-z_$]/.test(c)) {
      let k = i + 1;
      while (k < n && /[\w$]/.test(code[k])) k++;
      const word = code.slice(i, k);
      prev = REGEX_BEFORE.has(word) ? word : 'x';
      i = k;
    } else if (/\d/.test(c)) {
      let k = i + 1;
      while (k < n && /[\w.]/.test(code[k])) k++;
      prev = 'x';
      i = k;
    } else {
      if (!/\s/.test(c)) prev = c === ')' || c === ']' || c === '}' ? (c === '}' ? '}' : 'x') : c;
      i++;
    }
  }
  return { masked: out.join(''), strings };
}

const S = `('${FILL}*'|"${FILL}*"|\`${FILL}*\`)`; // a string literal in masked code
const ASSET = /^[^\s'"`<>()]*\.(png|jpe?g|gif|webp|avif|svg|ico|mp3|ogg|oga|wav|m4a|aac|flac|mp4|webm|json|woff2?|ttf|otf|css|html?|webmanifest|m?js|wasm|glb|gltf|bin|txt|xml|csv)([?#].*)?$/i;

/** References in a JS file: [{ spec, base: 'module' | 'document', kind, at }], plus problems. */
export function jsRefs(code) {
  const { masked, strings } = lexJs(code);
  const refs = [];
  const problems = [];
  const used = new Set();
  const str = (at) => strings.get(at);
  /** (pathy: a plain word such as this.src = 'hand' is a property, not a URL) */
  const lit = (re, kind, base, pathy = false) => {
    for (const m of masked.matchAll(re)) {
      const at = m.indices[1][0];
      const s = str(at);
      if (!s || (pathy && !s.computed && !/[./:]/.test(s.value))) continue;
      used.add(at);
      if (s.computed) problems.push({ at: m.index, msg: `${kind} with a computed path (\${...}): the crawler cannot check it` });
      else refs.push({ spec: s.value, base, kind, at });
    }
  };
  lit(new RegExp(String.raw`\bimport\s*(?:[\w$*{}\s,]+?\bfrom\s*)?` + S, 'gd'), 'import', 'module');
  lit(new RegExp(String.raw`\bexport\s*[\w$*{}\s,]+?\bfrom\s*` + S, 'gd'), 'export from', 'module');
  lit(new RegExp(String.raw`\bimport\s*\(\s*` + S + String.raw`\s*[,)]`, 'gd'), 'import()', 'module');
  lit(new RegExp(String.raw`\bnew\s+URL\s*\(\s*` + S + String.raw`\s*,\s*import\.meta\.url\b`, 'gd'), 'new URL(..., import.meta.url)', 'module');
  lit(new RegExp(String.raw`(?:\bfetch|\bimportScripts|\bnew\s+(?:Shared)?Worker|\bnew\s+Audio|\bnew\s+EventSource|\bwindow\.open|\blocation\.assign|\blocation\.replace)\s*\(\s*` + S, 'gd'), 'call', 'document');
  lit(new RegExp(String.raw`\b(?:href|src|poster|action|formaction)\s*:\s*` + S, 'gd'), 'href/src attribute', 'document', true);
  lit(new RegExp(String.raw`\.(?:href|src)\s*=(?!=)\s*` + S, 'gd'), '.href/.src =', 'document', true);
  for (const m of masked.matchAll(new RegExp(String.raw`\.setAttribute\s*\(\s*` + S + String.raw`\s*,\s*` + S, 'gd'))) {
    const name = str(m.indices[1][0]);
    const s = str(m.indices[2][0]);
    if (!name || !s || !/^(href|src|poster)$/.test(name.value || '')) continue;
    used.add(m.indices[2][0]);
    if (s.computed) problems.push({ at: m.index, msg: `setAttribute('${name.value}') with a computed path` });
    else refs.push({ spec: s.value, base: 'document', kind: `setAttribute('${name.value}')`, at: m.index });
  }
  // paths the crawler cannot follow: fail, so nobody ships a file it never checked
  const computed = (re, what) => {
    for (const m of masked.matchAll(re)) problems.push({ at: m.index, msg: `${what} with a computed path: the crawler cannot check it (use a string literal)` });
  };
  // (each lookahead holds its own \s*: outside it, backtracking would skip the check)
  computed(new RegExp(String.raw`\bimport\s*\((?!\s*` + S + String.raw`\s*[,)])`, 'g'), 'import()');
  computed(new RegExp(String.raw`\bnew\s+URL\s*\((?!\s*` + S + String.raw`)[^;]*?\bimport\.meta\.url\b`, 'g'), 'new URL(..., import.meta.url)');
  computed(new RegExp(String.raw`(?:\bfetch|\bimportScripts|\bnew\s+(?:Shared)?Worker|\bnew\s+EventSource|\bwindow\.open|\blocation\.assign|\blocation\.replace)\s*\((?!\s*` + S + ')', 'g'), 'a fetch / worker / window.open / location call');
  computed(new RegExp(String.raw`\bhref\s*:(?!\s*(?:` + S + String.raw`|null\b|undefined\b))`, 'g'), 'an href attribute');
  computed(new RegExp(String.raw`\.href\s*=(?!=)(?!\s*` + S + ')', 'g'), 'an .href assignment');
  // any other string that looks like a file path (an image, a sound, a JSON file...)
  for (const [at, s] of strings) {
    if (used.has(at) || s.computed || !ASSET.test(s.value)) continue;
    refs.push({ spec: s.value, base: 'document', kind: 'asset path string', at });
  }
  return { refs, problems };
}

/** References in CSS: url(...) and @import (relative to the stylesheet itself). */
export function cssRefs(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const refs = [];
  const skip = new Set();
  for (const m of code.matchAll(/@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1/g)) {
    refs.push({ spec: m[2], kind: '@import', at: m.index });
    skip.add(m.index);
  }
  for (const m of code.matchAll(/url\(\s*(["']?)([^"')]*?)\1\s*\)/g)) {
    const before = code.lastIndexOf('@import', m.index);
    if (before >= 0 && skip.has(before) && !code.slice(before, m.index).includes(';')) continue;
    refs.push({ spec: m[2].trim(), kind: 'url()', at: m.index });
  }
  return refs;
}

/** References in HTML: src / href / poster / srcset attributes, inline scripts and styles. */
export function htmlRefs(html) {
  const refs = [];
  const problems = [];
  const code = html.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const scripts = [];
  // inline <script> bodies are JS, not markup: take them out before reading attributes
  const markup = code.replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script\s*>)/gi, (m, open, attrs, body, close, at) => {
    if (body.trim() && !/\bsrc\s*=/.test(attrs)) scripts.push({ body, at: at + open.length });
    return open + body.replace(/[^\n]/g, ' ') + close;
  });
  for (const m of markup.matchAll(/<[a-z][\w-]*\b[^>]*>/gi)) {
    for (const a of m[0].matchAll(/\s(src|href|poster|srcset|data)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
      const v = a[2] ?? a[3] ?? a[4] ?? '';
      const specs = a[1].toLowerCase() === 'srcset' ? v.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean) : [v];
      for (const spec of specs) refs.push({ spec, base: 'document', kind: `<${/<([\w-]+)/.exec(m[0])[1]} ${a[1]}>`, at: m.index });
    }
    for (const st of m[0].matchAll(/\sstyle\s*=\s*"([^"]*)"/gi)) for (const r of cssRefs(st[1])) refs.push({ ...r, base: 'document', at: m.index });
  }
  for (const m of markup.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) for (const r of cssRefs(m[1])) refs.push({ ...r, base: 'document', at: m.index });
  for (const s of scripts) {
    const js = jsRefs(s.body);
    for (const r of js.refs) refs.push({ ...r, base: 'document', at: s.at + r.at });
    for (const p of js.problems) problems.push({ ...p, at: s.at + p.at });
  }
  return { refs, problems };
}

/** Is root/rel there with exactly this case (each segment checked against its folder)? */
export function existsExact(root, rel, kind = 'file') {
  if (rel === '') return kind === 'dir' && fs.existsSync(root);
  let dir = root;
  const segs = rel.split('/');
  for (let k = 0; k < segs.length; k++) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return false;
    }
    if (!names.includes(segs[k])) return false;
    dir = path.join(dir, segs[k]);
  }
  try {
    const st = fs.statSync(dir);
    return kind === 'dir' ? st.isDirectory() : st.isFile();
  } catch {
    return false;
  }
}

const lineOf = (text, at) => (at == null ? 0 : text.slice(0, at).split('\n').length);

/**
 * Follows every reference from index.html (and from every file in `also`) through the HTML,
 * CSS and JS under root. Returns { refs, reached, problems }: refs are
 * { from, line, kind, spec, target, status } with status 'ok' | 'skip' | 'omitted' | 'bad';
 * reached is the set of files (relative to root) the game references; problems are strings.
 * `read(rel)` may stand in for the disk (the build crawls its edited index.html that way).
 */
export function crawl(root, { entry = 'index.html', also = [], notShipped = NOT_SHIPPED, read, never = NEVER } = {}) {
  const readText = (rel) => (read && read(rel) != null ? read(rel) : fs.readFileSync(path.join(root, rel), 'utf8'));
  const docDir = path.posix.dirname(entry) === '.' ? '' : path.posix.dirname(entry);
  const refs = [];
  const problems = [];
  const reached = new Set([entry]);
  const queue = [entry, ...also.filter((f) => f !== entry)];
  const seen = new Set(queue);
  const omitted = new Set();
  while (queue.length) {
    const from = queue.shift();
    let text;
    try {
      text = readText(from);
    } catch (err) {
      problems.push(`${from}: cannot be read (${err.code || err.message})`);
      continue;
    }
    const ext = path.posix.extname(from).toLowerCase();
    let found = [];
    let local = [];
    if (ext === '.html' || ext === '.htm') ({ refs: found, problems: local } = htmlRefs(text));
    else if (ext === '.css') found = cssRefs(text).map((r) => ({ ...r, base: 'module' }));
    else if (ext === '.js' || ext === '.mjs') ({ refs: found, problems: local } = jsRefs(text));
    else if (ext === '.webmanifest') {
      try {
        const m = JSON.parse(text);
        for (const it of [...(m.icons || []), ...(m.screenshots || [])]) if (it && typeof it.src === 'string') found.push({ spec: it.src, base: 'module', kind: 'manifest icon' });
      } catch {
        problems.push(`${from}: not valid JSON`);
      }
    }
    for (const p of local) problems.push(`${from}:${lineOf(text, p.at)}: ${p.msg}`);
    for (const r of found) {
      const ref = { from, line: lineOf(text, r.at), kind: r.kind, spec: r.spec, target: null, status: 'ok' };
      refs.push(ref);
      const spec = r.spec.trim();
      const bad = (msg) => {
        ref.status = 'bad';
        problems.push(`${from}:${ref.line}: ${r.kind} "${r.spec}" ${msg}`);
      };
      if (spec === '' || spec.startsWith('#') || /^(data|blob|about|javascript|mailto|tel):/i.test(spec)) {
        ref.status = 'skip';
        continue;
      }
      const ns = notShipped.find((x) => x.from === from && x.spec === spec);
      if (ns) {
        ref.status = 'omitted';
        ref.why = ns.why;
        omitted.add(ns);
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(spec) || spec.startsWith('//')) {
        bad('points off the build: the game must work from its own files (or list it in NOT_SHIPPED with a reason)');
        continue;
      }
      if (spec.startsWith('/')) {
        bad('is root-absolute: itch serves the game under /html/<upload id>/, so every path must be relative');
        continue;
      }
      if (r.base === 'module' && /^(import|export from|import\(\))$/.test(r.kind) && !/^\.{1,2}\//.test(spec)) {
        bad('is a bare module specifier (there is no import map): use ./ or ../');
        continue;
      }
      if (spec.includes('\\')) {
        bad('has a backslash: use forward slashes');
        continue;
      }
      const clean = spec.replace(/[?#].*$/, '');
      const baseDir = r.base === 'document' ? docDir : path.posix.dirname(from) === '.' ? '' : path.posix.dirname(from);
      const isDir = clean === '' || clean === '.' || clean.endsWith('/') || clean === '..';
      let target = path.posix.normalize(path.posix.join(baseDir, clean || '.'));
      if (target === '.' || target === './') target = '';
      target = target.replace(/\/$/, '');
      ref.target = target;
      if (target === '..' || target.startsWith('../')) {
        bad(`leaves the build root (it resolves to ${target}${isDir ? '/' : ''}): hide it in the itch build and list it in NOT_SHIPPED`);
        continue;
      }
      if (isDir) {
        if (!existsExact(root, target, 'dir')) bad(`is not a folder of the build (exact case)`);
        continue;
      }
      if (never.some((re) => re.test(target))) {
        bad(`resolves to ${target}, which the itch build never ships`);
        continue;
      }
      if (!existsExact(root, target, 'file')) {
        bad(`resolves to ${target}, which is not in the build with that exact case`);
        continue;
      }
      reached.add(target);
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  for (const ns of notShipped) if (!omitted.has(ns)) problems.push(`NOT_SHIPPED lists ${ns.from} -> "${ns.spec}", but no such reference exists any more: remove the entry`);
  return { refs, reached, problems };
}

// --- zip ----------------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (the zip / PNG one) of a buffer. */
export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS time and date fields for a 'YYYY-MM-DD' day at 00:00. */
function dosDateTime(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day || '');
  const [y, mo, d] = m ? [+m[1], +m[2], +m[3]] : [1980, 1, 1];
  return { time: 0, date: ((Math.max(1980, y) - 1980) << 9) | (mo << 5) | d };
}

/**
 * A zip of [{ name, data }]: deflated (stored when that is not smaller), entries sorted by
 * name, folders implicit, every timestamp `day` at 00:00, so equal input gives equal bytes.
 */
export function makeZip(entries, { day } = {}) {
  const { time, date } = dosDateTime(day);
  const files = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  if (files.length > 0xfffe) throw new Error('build-itch: too many files for a plain zip');
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of files) {
    if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(name) || name.split('/').some((s) => s === '.' || s === '..')) throw new Error(`build-itch: unsafe zip entry name "${name}" (letters, digits, . _ - and / only)`);
    const nameBuf = Buffer.from(name, 'ascii');
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    if (body.length > 0xfffffffe || data.length > 0xfffffffe || offset > 0xfffffffe) throw new Error('build-itch: zip too big (no zip64 here)');
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed: 2.0 (deflate)
    lh.writeUInt16LE(0, 6); // flags
    lh.writeUInt16LE(stored ? 0 : 8, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28); // extra
    locals.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, 2.0 (so the mode below counts)
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(stored ? 0 : 8, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30); // extra
    ch.writeUInt16LE(0, 32); // comment
    ch.writeUInt16LE(0, 34); // disk
    ch.writeUInt16LE(0, 36); // internal attributes
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); // a plain rw-r--r-- file
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cd, end]);
}

// --- the build ----------------------------------------------------------------------------------

/** Every file under dir (relative, forward slashes, sorted), dotfiles left out. */
export function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base));
    else if (e.isFile()) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out.sort();
}

const inside = (child, parent) => {
  const r = path.relative(parent, child);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

/**
 * The list of files a build wrote into its folder (a dotfile, so it never ships). The next build
 * replaces the folder only if every file in it is on that list or about to be written again.
 */
const MANIFEST = '.itch-build.json';

/** Every file and folder under dir, dotfiles included: { files, other } (relative, '/'). */
function listAll(dir, base = dir, acc = { files: [], other: [] }) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(base, p).split(path.sep).join('/');
    if (e.isDirectory()) listAll(p, base, acc);
    else if (e.isFile()) acc.files.push(rel);
    else acc.other.push(rel); // a link, socket...: never ours
  }
  return acc;
}

/** Refuses an --out or --zip that could wipe or touch something that is not this build's own. */
/** The real path of p, symlinks resolved, also for a path that doesn't exist yet (its nearest existing folder). */
function real(p) {
  const rest = [];
  let a = path.resolve(p);
  while (!fs.existsSync(a) && path.dirname(a) !== a) {
    rest.unshift(path.basename(a));
    a = path.dirname(a);
  }
  try {
    return path.join(fs.realpathSync(a), ...rest);
  } catch {
    return path.resolve(p);
  }
}

function checkPaths(out, zip, src) {
  // (compared as real paths, so a symlink can't lead the output into the source)
  [out, zip, src] = [real(out), zip && real(zip), real(src)];
  if (inside(src, out)) throw new Error(`build-itch: --out ${out} holds the game's source: pick another folder`);
  if (inside(out, src)) throw new Error(`build-itch: --out ${out} is inside battle/: pick a folder outside the game's source`);
  if (zip && inside(zip, out)) throw new Error('build-itch: the zip cannot go inside --out (it would ship inside the next build)');
  if (zip && inside(zip, src)) throw new Error(`build-itch: the zip cannot go inside battle/ (${zip}): pick a path outside the game's source`);
  if (fs.existsSync(out) && !fs.statSync(out).isDirectory()) throw new Error(`build-itch: --out ${out} is not a folder`);
}

/**
 * Refuses a non-empty --out unless every file in it is one this build writes (ship) or one the
 * build that made the folder wrote (its MANIFEST). An itch index.html is not enough: the zip has no
 * wrapping folder, so unpacking it in Downloads puts one next to the player's own files.
 */
function checkOutOwned(out, ship) {
  if (!fs.existsSync(out)) return;
  const { files, other } = listAll(out);
  if (!files.length && !other.length) return;
  const ours = new Set([...ship, MANIFEST]);
  try {
    const m = JSON.parse(fs.readFileSync(path.join(out, MANIFEST), 'utf8'));
    if (m && Array.isArray(m.files)) for (const f of m.files) if (typeof f === 'string') ours.add(f);
  } catch {
    // no list: only the files this build writes count as ours
  }
  const foreign = [...other, ...files.filter((f) => !ours.has(f))].sort();
  if (foreign.length) {
    const some = foreign.slice(0, 6).join(', ') + (foreign.length > 6 ? `, and ${foreign.length - 6} more` : '');
    throw new Error(`build-itch: --out ${out} holds files this build did not write: ${some}. Remove them or pick another folder`);
  }
}

/**
 * Builds the itch folder and zip. Returns { version, files: [{ name, bytes }], bytes, zipBytes,
 * out, zip, refs, omitted }. Throws (listing every problem) when a reference does not resolve.
 */
export function build({ out = path.join(REPO, 'dist', 'itch'), zip = path.join(REPO, 'dist', 'wobble-war-itch.zip'), src = BATTLE } = {}) {
  out = path.resolve(out);
  zip = zip ? path.resolve(zip) : null;
  checkPaths(out, zip, path.resolve(src));
  const version = readVersion(src);
  const index = itchIndex(fs.readFileSync(path.join(src, 'index.html'), 'utf8'), version);

  // 1. what to ship: the fixed set, the source tree(s), and whatever they reference
  const base = [...SHIP, ...SHIP_TREES.flatMap((t) => walk(path.join(src, t)).map((f) => `${t}/${f}`))];
  const first = crawl(src, { also: base, read: (rel) => (rel === 'index.html' ? index : null) });
  if (first.problems.length) throw new Error(`build-itch: ${first.problems.length} broken reference(s) in battle/:\n  ` + first.problems.join('\n  '));
  const ship = [...new Set([...base, ...first.reached])].sort();
  for (const f of ship) if (NEVER.some((re) => re.test(f))) throw new Error(`build-itch: ${f} must never ship`);

  // 2. write the folder (replacing only an earlier build of it)
  checkOutOwned(out, ship);
  fs.rmSync(out, { recursive: true, force: true });
  for (const f of ship) {
    const to = path.join(out, ...f.split('/'));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (f === 'index.html') fs.writeFileSync(to, index);
    else fs.copyFileSync(path.join(src, ...f.split('/')), to);
  }
  fs.writeFileSync(path.join(out, MANIFEST), JSON.stringify({ tool: 'battle/tools/build-itch.mjs', version, files: ship }, null, 1) + '\n');

  // 3. check the folder as shipped: every reference resolves inside it, exact case
  const names = walk(out);
  const check = crawl(out, { also: names });
  const problems = [...check.problems];
  const unused = names.filter((f) => !check.reached.has(f));
  if (names.length > LIMITS.files) problems.push(`${names.length} files: itch takes at most ${LIMITS.files}`);
  const files = names.map((name) => ({ name, bytes: fs.statSync(path.join(out, name)).size }));
  const bytes = files.reduce((s, f) => s + f.bytes, 0);
  if (bytes > LIMITS.bytes) problems.push(`${bytes} bytes: itch takes at most ${LIMITS.bytes} extracted`);
  for (const f of files) if (f.bytes > LIMITS.fileBytes) problems.push(`${f.name}: ${f.bytes} bytes, itch takes at most ${LIMITS.fileBytes} per file`);
  if (!names.includes('index.html')) problems.push('no index.html at the root');
  if (problems.length) throw new Error(`build-itch: ${problems.length} problem(s) in ${out}:\n  ` + problems.join('\n  '));

  // 4. the zip
  let zipBytes = 0;
  if (zip) {
    const buf = makeZip(
      names.map((name) => ({ name, data: fs.readFileSync(path.join(out, name)) })),
      { day: version },
    );
    fs.mkdirSync(path.dirname(zip), { recursive: true });
    fs.writeFileSync(zip, buf);
    zipBytes = buf.length;
  }
  const omitted = check.refs.filter((r) => r.status === 'omitted');
  return { version, files, bytes, zipBytes, out, zip, refs: check.refs, omitted, unused };
}

// --- CLI ----------------------------------------------------------------------------------------

function main(argv) {
  const args = { out: undefined, zip: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' || a === '--zip') {
      if (!argv[i + 1]) throw new Error(`build-itch: ${a} needs a path`);
      args[a.slice(2)] = argv[++i];
    } else if (a === '-h' || a === '--help') {
      console.log('usage: node battle/tools/build-itch.mjs [--out <dir>] [--zip <file>]\n  defaults: dist/itch/ and dist/wobble-war-itch.zip at the repo root');
      return;
    } else throw new Error(`build-itch: unknown argument ${a} (try --help)`);
  }
  const r = build({ ...(args.out ? { out: args.out } : {}), ...(args.zip ? { zip: args.zip } : {}) });
  const fmt = (n) => n.toLocaleString('en-US');
  const show = (p) => (inside(p, process.cwd()) ? path.relative(process.cwd(), p) || '.' : p);
  const checked = r.refs.filter((x) => x.status === 'ok').length;
  console.log(`Wobble War itch.io build ${r.version}`);
  console.log(`  ${r.files.length} files, ${fmt(r.bytes)} bytes -> ${show(r.out)}/`);
  if (r.zip) console.log(`  zip: ${fmt(r.zipBytes)} bytes -> ${show(r.zip)}`);
  console.log(`  references: ${checked} resolve (exact case, inside the build)`);
  for (const o of r.omitted) console.log(`  left out on purpose: ${o.from} -> "${o.spec}" (${o.why})`);
  if (r.unused.length) console.log(`  shipped but never referenced: ${r.unused.join(', ')}`);
}

/** Run as a script (also through a symlinked path: node gives this module its real path). */
function isMain() {
  try {
    return !!process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
