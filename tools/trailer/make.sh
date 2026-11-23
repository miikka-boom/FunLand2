#!/bin/bash
# Re-shoot and build one of the trailers in ../../trailers: ./make.sh 1|2|3|4
# (1: the first trailer, 2: co-op, 3: "Where is Ben?", 4: the escape). Output: tools/trailer/*.mp4
set -euo pipefail
cd "$(dirname "$0")"
case "${1:-}" in
  1) export SHOTS=./shots.js; shots="open dark witch horde pier"; prefix=""; build=./build.sh ;;
  2) export SHOTS=./shots2.js; shots="duo_open duo_lights duo_terror duo_hunter duo_revive duo_hold duo_ferry"; prefix=""; build=./build2.sh ;;
  3) export SHOTS=./shots3.js CRAYON_FONT=1; shots="wall lou prints glimpse reach bed squad"; prefix="ben_"; build=./build3.sh ;;
  4) export SHOTS=./shots4.js; shots="t5_walk t4_dark t4_witch t4_horde t5_escape"; prefix=""; build=./build4.sh ;;
  *) echo "usage: $0 1|2|3|4"; exit 1 ;;
esac
# Trailer 3 draws Ben's crayon in Comic Neue (OFL), standing in for the Chalkboard SE / Comic Sans a phone has.
if [ "$1" = 3 ] && [ ! -d fontpkg/package ]; then
  mkdir -p fontpkg && (cd fontpkg && npm pack @fontsource/comic-neue --silent >/dev/null && tar -xzf fontsource-comic-neue-*.tgz)
fi
for s in $shots; do node capture.js "$s" "frames/$prefix$s" 1; done
"$build"
