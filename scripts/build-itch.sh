#!/usr/bin/env bash
# Packs We Left Ben as an itch.io HTML5 upload: dist/itch/we-left-ben-itch-<commit>.zip
#
# The game has no build step, so this only picks the files the game needs (tracked files
# only, so local junk never ships) and zips them with index.html at the root, as itch wants.
# Included: the game (index.html, src/, assets/), the one-thumb version (portrait/) and
# WOBBLE WAR (battle/), the two pages the title screen links to. Left out: tests, docs,
# balance tools, and the metagame prototypes nothing in the game links to.
#
# Usage: npm run build:itch   (or: bash scripts/build-itch.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

commit=$(git rev-parse --short HEAD)
dirty=$(git status --porcelain -- index.html style.css src assets portrait battle | head -c1)
name="we-left-ben-itch-${commit}${dirty:+-dirty}"
out=dist/itch
stage="$out/$name"

rm -rf "$stage" "$out/$name.zip"
mkdir -p "$stage"

git ls-files -z -- index.html style.css icon.svg icon-180.png manifest.webmanifest src assets portrait battle \
  | grep -zv '^battle/tools/' \
  | xargs -0 cp --parents -t "$stage"

count=$(find "$stage" -type f | wc -l)
if [ ! -f "$stage/index.html" ]; then echo "error: no index.html in the build" >&2; exit 1; fi
if [ "$count" -gt 1000 ]; then echo "error: $count files; itch allows at most 1000" >&2; exit 1; fi

(cd "$stage" && zip -qrX9 "../$name.zip" .)
echo "$out/$name.zip  ($count files, $(du -h "$out/$name.zip" | cut -f1))"
