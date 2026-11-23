# Trailer tools

Shoots trailers from the real game, frame by frame, and cuts them to 30 seconds (trailer 4: 20). The finished
trailers are in [`../../trailers`](../../trailers).

```
./make.sh 4      # re-shoot and build trailer 4 (1: first, 2: co-op, 3: "Where is Ben?", 4: the escape)
```

Needs Node with Playwright and its Chromium, Python 3 with Pillow and NumPy, ffmpeg, and the Inter
font (`INTER_DIR` if it isn't in `/usr/share/fonts/opentype/inter/`). Trailer 3 also fetches Comic
Neue from npm (see below).

## How a shot is captured (`capture.js`)

- **The game, unchanged.** The repo's files are served straight from disk into headless Chromium
  through request interception: no server, and nothing in `src/` is edited.
- **A virtual clock.** `requestAnimationFrame` and `performance.now()` only move when the harness
  steps them, exactly 1/30 s a frame, so footage is smooth however slowly the page renders.
- **A scripted gamepad.** The survivor is driven through a fake standard gamepad (`window.__pad`):
  analog move and aim as screen directions; an aim stick below 0.5 aims without firing.
- **A clean HUD.** `hud.js` is patched as it is served (`window.__cleanHud`): the panels, buttons,
  sticks, arrows and the end-of-run card are hidden; the game's own call-outs stay. A shot can also
  set `window.__noHurt` to drop the red damage flash (god mode still takes the hits).
- **A directed camera.** `window.__cam = { x, y, zoom, still }` is applied just before each frame is
  drawn (via `game.syncView()`).
- **`CRAYON_FONT=1`** loads Comic Neue (SIL OFL) under the names the game asks for Ben's crayon
  ("Chalkboard SE", "Comic Sans MS"), so his writing looks as it does on a phone rather than in
  a fallback serif.

```
SHOTS=./shots4.js node capture.js t6_escape frames/t6_escape 1   # 1 = keep every frame (10: one in ten, for a quick look)
```

A shot (`shots*.js`) is `{ settings, frames, setup(game), direct(i, game, pad) }`: `setup` runs on
the title screen (teleports, spawns, a Witch never culled because you start near her), `direct`
before every frame. The partner is the game's AI teammate; `puppetAlly` (shots2.js) can steer its
light.

## The cut, the sound, the encode

- `edit*.py` cuts the frames to 900 (30 s at 30 fps; trailer 4: 600, 20 s), sets the titles in Inter and
  draws the end card (trailer 4 has none: it ends on black and the small print).
- `mix*.py` places cues from the game's score (`assets/music`) on the cut; trailer 1 and 4 add a
  synthesised blast (the music ducks under it), trailer 3 rebuilds Ben's whistle and footsteps from
  the game's own synth code.
- `build*.sh` renders, mixes, sets the loudness (gain to -14 LUFS, or -16 for trailer 3, then a peak
  limiter; trailer 4 runs it twice, since its limiter takes the top off the blast) and encodes H.264 + AAC.
- `sheet.py` makes contact sheets; `env.py` prints a cue's loudness over time.
