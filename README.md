# FunLand2

A series of small browser game prototypes. Each one is a static site with no
build step and no dependencies.

| Prototype | Folder | What it's testing |
|---|---|---|
| 0: HORDE | [`/`](index.html) | Twin-stick touch controls for top-down zombie horde survival |
| 1: WOBBLE WAR | [`battle/`](battle/) | Funny, satisfying 2D physics units in a side-view battle simulator |

# Prototype 1: "WOBBLE WAR"

A simplified 2D side-view battle simulator in the spirit of Totally Accurate
Battle Simulator. You place wobbly bean soldiers, press **FIGHT!**, and watch
them bonk each other. **Prototype 1** is about making those physics-body units
look and feel as funny and satisfying as possible.

Play it at `battle/` (locally: `npm start`, then open
`http://localhost:8080/battle/`). It works with a mouse or touch, in landscape
on phones.

## The units

| Unit | Cost | Role |
|---|---|---|
| **Clubber** | 60 | Big overhead club swing. The hit launches beans spinning through the air and knocks them down. |
| **Squire** | 90 | Sword and shield. Raises the shield when archers aim at it, and blocks sword pokes from the front. Clubs come down over the top. |
| **Archer** | 80 | Lobs arrows on a ballistic arc. Arrows stick in bodies, shields and the ground, and stay in the corpses. Squishy up close. |

Rock-paper-scissors: archers shoot clubbers before they arrive, clubbers bonk
squires over their shields, and squires walk through arrow rain under a raised
shield.

## How the beans work

Every bean is a small Verlet ragdoll: hip, chest and head particles make the
bendy body, plus knees, feet, elbows, hands and a weapon tip. The "muscles"
are spring forces toward animated targets: hold the hips up, keep the head over
the hips, plant the feet in procedural steps, and swing the hands and weapon
through attack poses. Every muscle is scaled by the bean's **consciousness**. A
hit knocks some of it out, so the bean wobbles, sags or flops over. Then the
muscles fade back in and it gets up, dizzy. Dead means consciousness zero
forever: a limp ragdoll that drops its weapon.

The jokes come from that one rule plus a few extras:
- **Googly eyes:** each pupil is a little physics point pushed by gravity and
  the head's acceleration, so it jiggles with every step and spins when hit.
- **Faces:** angry brows when attacking, an "O" mouth for battle cries and
  screams, a smile when cheering, droopy eyelids when dead.
- **Squash and stretch** follows the hips' vertical acceleration.
- **Bonks:** club hits launch beans up and away with spin. Launched beans
  scream, windmill their arms and run in the air.
- **Juice:** hit-stop on big hits, screen shake, comic starbursts and dirt
  clods, "BONK!" pop-ups, slow motion on the final blow, and the winners hop
  and cheer.
- **Hand of god:** drag a bean to pick it up. It dangles and flails, and you
  can fling it.

## Modes

- **Campaign:** six rounds. Red's army is preset, and you have a gold budget
  for blue. **Retry** replays your placement; **Change army** lets you edit it.
- **Sandbox:** place both armies (left of the field is blue, right is red) with
  no budget. You can grab beans during the battle too.

Controls: tap or click your side of the field to place the selected unit. Drag
a bean to grab it, drag elsewhere to pan, pinch or scroll to zoom. The 🐢 button
toggles slow motion. Keys: `1` `2` `3` pick a unit, `E` remove, `Space` fight,
`S` slow-mo, `F` auto camera, `R` reset, `M` mute, `Esc` menu.

## Code map (battle/)

```
battle/index.html, style.css    page shell, storybook HUD, title, dock
battle/src/config.js             world layout + team colours shared by everything
battle/src/sim/physics.js        Verlet particles, constraints, ground, segment tests
battle/src/sim/unit.js           the bean: skeleton, muscles, walking, attacks, eyes, AI
battle/src/sim/unit-types.js     the three units: stats, weapons, attack poses
battle/src/sim/battle.js         placement, fixed-step sim, melee hits, arrows, dropped gear, win check
battle/src/campaign.js           the six rounds
battle/src/render/units.js       drawing beans, faces, weapons, arrows
battle/src/render/background.js  sky, parallax hills, castles, grass, dirt cross-section
battle/src/render/effects.js     starbursts, sparks, dust, dirt, confetti, comic words
battle/src/render/camera.js      auto-framing, pan/zoom, screen shake
battle/src/audio.js              WebAudio synth: bonks, clanks, squeaky voices, horn
battle/src/input.js              tap / grab / pan / pinch / wheel
battle/src/main.js               game flow, sim events -> juice, frame loop
```

The simulation (`battle/src/sim/`) has no DOM code, runs at a fixed 120 Hz with
a seeded RNG, and replays identically from the same placement, so it is tested
headless in `tests/battle-*.test.js`. `window.__ww` exposes the game in the
browser console.

# Prototype 0: "HORDE"

A top-down 2D zombie horde survival game for mobile browsers, going for a
Left 4 Dead feel. **Prototype 0** is about nailing down the **twin-stick touch
controls** and how fighting a horde feels in single player.

Play it on a phone in landscape. It runs as a static site with no build step
and no dependencies.

## What's in it

- **Twin virtual sticks**: the left thumb moves and the right thumb aims.
  Push past the dashed fire ring to shoot; tap the aim side to **shove**. The
  full spec and the reasoning are in [docs/CONTROLS.md](docs/CONTROLS.md).
- **Live feel tuning**: the sliders button (top right) pauses the game and
  opens every feel parameter: stick modes and size, dead zones, fire ring, aim
  assist, smoothing, camera, speed, horde size and so on. There are presets
  for A/B testing, and **Copy tuning JSON** copies only what you changed.
- **A run across a dark city**: start in a safe room (bottom left) and reach
  the green safe room across town. A green arrow at the screen edge points to
  it.
- **An AI Director**: build-up, peak and relax phases, wanderers, small groups,
  and mobs ("HERE THEY COME!") that spawn out of sight and come round corners.
  Shooting a car with a blinking red light sets off the **alarm**, which brings
  a three-wave panic event.
- **Common infected** that shamble, notice you, sprint in packs, path around
  buildings with a flow field, crowd you and claw. Getting hit slows you down,
  and under 40 HP you limp.
- **Four guns** to compare feel: SMG, assault rifle (pierces 2), pump shotgun
  (loads shell by shell; firing interrupts the reload) and hunting rifle
  (pierces lines of zombies). Reloading is automatic when empty.
- **Night**: a flashlight cone, street lamps, burning wrecks and
  line-of-sight shadows, so zombies behind buildings stay hidden until you
  round the corner. You can turn it off in the panel.
- **Feedback**: synthesized sound (no audio files), haptics on Android, blood
  decals that stay, casings, tracers, screen shake and recoil, off-screen
  threat arrows.

## Run it

- **GitHub Pages:** `https://miikka-boom.github.io/FunLand2/` (HORDE) and
  `https://miikka-boom.github.io/FunLand2/battle/` (WOBBLE WAR), once this is on
  the default branch (the Pages workflow only deploys from there).
- **Locally:** `npm start` (or `python3 -m http.server 8080`), then open
  `http://localhost:8080`. To try it on a phone, open
  `http://<your-computer-ip>:8080` on the same network. Opening `index.html`
  straight from disk doesn't work, because browsers block ES modules on
  `file://`.
- **iPhone:** use Share → Add to Home Screen for true full screen. Android
  goes full screen when you tap Start.
- **Desktop:** WASD to move, the mouse to aim, click to fire, Space to shove,
  R to reload, Q to swap, Esc for tuning. A gamepad works too.

## Code map

```
index.html, style.css      page shell, title card, tuning panel styles
src/main.js                boot, resize/safe areas, pause, frame loop
src/settings.js            every tunable value + panel schema + presets
src/settings-panel.js      tuning panel UI
src/layout.js              HUD/button/stick positions (shared by drawing + hit tests)
src/input/                 stick-math (pure, unit tested), touch, desktop, gamepad
src/world/                 seeded city generator, collision, ray casts, flow field
src/game/                  player, weapons, zombies, director, effects, game state
src/render/                renderer, lighting (night + LOS), HUD
src/audio.js               WebAudio synth SFX
tests/                     node --test unit tests (stick math, touch controller rules, battle sim)
```

`window.__p0` exposes the game, settings and input in the browser console.

## Tests

```
npm test
```

## Deployment

[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
publishes the repository as a static site from the default branch. To set it
up once, go to **Settings → Pages → Source** and choose **GitHub Actions**.
`package.json` has no `build` script, so the workflow serves the files as they
are.
