# FunLand2: Prototype 0, "HORDE"

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
- **Special infected**:
  - The **Hunter** tests shove timing. It screeches, then pounces: shove it
    out of the air (deadstop), shoot it mid-air (skeet), or get pinned and
    tap to break free.
  - The **Tank** tests kiting. It's a boss with a telegraphed haymaker that
    sends you flying and rocks you can dodge or shoot down. It arrives once
    per run, mid-route, with a boss bar and its own music.
  - The spec is in [docs/CONTROLS.md](docs/CONTROLS.md#special-infected-stress-tests-for-the-controls),
    and the tuning panel has Spawn Hunter / Spawn Tank buttons.
- **Four guns** to compare feel: SMG, assault rifle (pierces 2), pump shotgun
  (loads shell by shell; firing interrupts the reload) and hunting rifle
  (pierces lines of zombies). Reloading is automatic when empty.
- **Night**: a flashlight cone, street lamps, burning wrecks and
  line-of-sight shadows, so zombies behind buildings stay hidden until you
  round the corner. You can turn it off in the panel.
- **Feedback**: synthesized sound (no audio files), haptics on Android, blood
  decals that stay, casings, tracers, screen shake and recoil, off-screen
  threat arrows.

## Road to Evac: the metagame prototype

[`evac/`](evac) is a separate page with a metagame for a co-op zombie
survivor game, prototyped on its own. It isn't connected to the action game:
a **simulated PLAY button** stands in for a run.

- One road through five districts to the evac chopper. Every stop you clear
  drives the van on and often hands you a new gun or rescues a survivor, who
  joins your squad of four.
- Runs earn **Supplies**, which buy instant upgrades (survivors and guns,
  levels 1–12). **Gems** pay for revives and for skipping the airdrop wait.
  Those are the only two currencies.
- PLAY always plays the next stop. The goal card shows the next reward, and
  a coach bubble names the best next step.
- Two wait rewards: a **Supply Crate** every 30 minutes and an **Airdrop**
  every 8 hours. Nothing else waits on a timer.
- The testing drawer (gear, top right) has forced outcomes, time warp,
  cheats, live economy sliders and a pacing log.
  `npm run evac:balance` simulates days of play.

Open `/evac/` (on Pages: `https://miikka-boom.github.io/FunLand2/evac/`).
The design, numbers and the RunLoadout / RunResult contract with the game
are in [docs/METAGAME.md](docs/METAGAME.md).

The first metagame prototype, a survivor camp with base building
([`camp/`](camp), [docs/METAGAME-CAMP.md](docs/METAGAME-CAMP.md)), is still
there for comparison at `/camp/`.

## Run it

- **GitHub Pages:** `https://miikka-boom.github.io/FunLand2/` once this is on
  the default branch (the Pages workflow only deploys from there). The
  metagame is at `/evac/` and the v1 camp at `/camp/`.
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
evac/                      Road to Evac metagame prototype (separate page; map in docs/METAGAME.md)
camp/                      v1 camp metagame prototype (separate page; map in docs/METAGAME-CAMP.md)
tests/                     node --test unit tests (stick math, touch controller rules, both metagames)
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
