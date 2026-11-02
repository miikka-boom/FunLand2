# FunLand2

This site is deployed automatically to GitHub Pages by
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml).

## One-time setup

In the repository on GitHub, open **Settings → Pages** and under
**Build and deployment → Source** choose **GitHub Actions**.

After that, every push to the default branch publishes the site. You can also
run the workflow by hand from the **Actions** tab ("Deploy to GitHub Pages" → "Run workflow").

## What gets published

- **Static site (default):** the files in the repository (except `.git` and `.github`)
  are published as they are. `index.html` at the repository root is the home page.
- **Node project:** if a `package.json` with a `build` script is present, the workflow
  runs `npm ci` (or `npm install`) and `npm run build`, then publishes the first of
  `dist/`, `build/`, `out/` or `public/` that contains an `index.html`.

If you use a bundler such as Vite, set its base path to `/FunLand2/` (for example
`base: '/FunLand2/'` in `vite.config.js`) so assets load from the project's Pages URL.

The site will be at `https://miikka-boom.github.io/FunLand2/`.
