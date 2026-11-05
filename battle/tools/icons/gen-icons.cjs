// Renders the Wobble War app icons (icon-art.html) with headless Chromium and
// writes them into battle/icons/. Run from the repo root:
//   node battle/tools/icons/gen-icons.cjs
// Needs Playwright with Chromium. Remember to bump VERSION in battle/sw.js after.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', '..', 'icons');
const ART = 'file://' + path.join(__dirname, 'icon-art.html');
const SET = [
  ['icon-192.png', 192, { round: 0.22, scale: 0.92 }],
  ['icon-512.png', 512, { round: 0.22, scale: 0.92 }],
  ['icon-maskable-512.png', 512, { scale: 0.78 }],
  ['apple-touch-icon.png', 180, { scale: 0.9 }],
];
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', (e) => {
    console.log('pageerror', e.message);
    process.exitCode = 1;
  });
  await p.goto(ART);
  for (const [name, S, opts] of SET) {
    const url = await p.evaluate(([S, opts]) => render(S, opts), [S, opts]);
    const buf = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, name), buf);
    console.log(name, S, buf.length, 'bytes');
  }
  await b.close();
})();
