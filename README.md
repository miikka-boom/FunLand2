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

## Camp: the metagame prototype

[`camp/`](camp) is a separate page with a survivor-camp base-building
metagame, prototyped on its own. It isn't connected to the action game: a
**simulated PLAY button** stands in for a run.

- Runs bring home scrap, wood, food, gems and survivors. Camp buildings give
  the next run guns, damage, max HP, medkits, crafted items, extra loot and
  new zones.
- Buildings unlock slowly through Command Post levels 1–8 and two rubble
  expansions, guided by 36 objectives.
- Idle production, builds, expeditions and crafting all run on timers,
  including while the page is closed. Gems rush any timer or buy missing
  resources.
- Two wait rewards: a **Supply Crate** every 10 minutes and an **Airdrop**
  every 8 hours.
- The tuning drawer (gear, top right) has time warp, fast-forward, cheats,
  live economy multipliers and a pacing log.
  `npm run camp:balance` simulates days of play.

Open `/camp/` (on Pages: `https://miikka-boom.github.io/FunLand2/camp/`).
The design, unlock schedule, numbers and the RunLoadout / RunResult
contract with the game are in [docs/METAGAME.md](docs/METAGAME.md).

## Safehouse: a second metagame prototype

[`safehouse/`](safehouse) is another separate page, built from the design doc
*Safehouse: Meta-Progression Design for a Co-op Zombie Mobile Game*. It isn't
connected to the action game or to the camp: a **PLAY · simulation** button
runs a simulated co-op mission in place of a real one.

- One screen with eight stations in a building cross-section. Tapping a
  station opens a sheet with Upgrade, Craft and Collect. It works in
  portrait and landscape.
- Four resources: Scrap, Parts, Supplies and Fuel. Mission loot is banked at
  every safe room, every player gets the full share, and payouts over a cap
  turn into Scrap.
- A Generator sets power capacity and the Fuel tank. Crafts draw power while
  they run and burn Fuel when they start. Queued jobs start on their own,
  also while you're away.
- Upgrades are gated by the Barricade (stations can be at most one level
  above it), by chapters cleared and by build slots. Cancelling refunds
  everything.
- The Loadout Crate fills three mission slots: a throwable, a heal and a
  boost. Everyone gets a free bandage, and unused items come back.
- Five named survivors play as bot teammates. They arrive in scripted
  chapter finales and Radio Room rescue calls, and bonds grow with every
  mission played together. A simulated friend shows how co-op shares the
  best bonuses.
- The Radio Room opens new chapters and adds daily orders, which stack up to
  three.
- The five-stage progression flow comes with a guide and a pacing log.
- The tuning drawer (gear, top right) has time warp, cheats, forced mission
  outcomes and live multipliers. `npm run safehouse:balance` simulates weeks
  of play.

Open `/safehouse/` (on Pages: `https://miikka-boom.github.io/FunLand2/safehouse/`).
The design decisions, numbers, pacing results and the MissionLoadout /
MissionReport contract are in [docs/SAFEHOUSE.md](docs/SAFEHOUSE.md).

## Run it

- **GitHub Pages:** `https://miikka-boom.github.io/FunLand2/` once this is on
  the default branch (the Pages workflow only deploys from there). The camp
  is at `/camp/` and the Safehouse at `/safehouse/`.
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
camp/                      camp metagame prototype (separate page; map in docs/METAGAME.md)
safehouse/                 Safehouse metagame prototype (separate page; map in docs/SAFEHOUSE.md)
tests/                     node --test unit tests (stick math, touch controller rules, camp and Safehouse economy)
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
