# FunLand2

A series of small browser game prototypes. Each one is a static site with no
build step and no dependencies.

| Prototype | Folder | What it's testing |
|---|---|---|
| 0: HORDE | [`/`](index.html) | Twin-stick touch controls for top-down zombie horde survival |
| 1: WOBBLE WAR | [`battle/`](battle/) | Funny, satisfying 2D physics units in a side-view battle simulator |
| Road to Evac | [`evac/`](evac) | A metagame for a co-op zombie survivor game (simulated runs) |
| Safehouse | [`safehouse/`](safehouse) | Another metagame: meta-progression for a co-op zombie mobile game |
| Camp | [`camp/`](camp) | The first metagame prototype: a survivor camp with base building |

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
| **Clubber** | 65 | Big overhead club swing. The hit launches beans cartwheeling through the air and knocks them down. Breaks into a yelling charge when close. |
| **Squire** | 95 | Sword and shield. Raises the shield when archers aim at it and blocks hits from the front; a block stops the swing. Heavy: flies lower. Clubs come down over the top. |
| **Archer** | 75 | Lobs arrows on a ballistic arc (and sometimes misses). Arrows stick and quiver in bodies, shields and the ground, and stay in the corpses. Squishy up close. |
| **Spiker** (triangle, small) | 45 | Fast and pointy. Rears back, then pounces point-first and rams beans into the sky. A shield bounces it straight back, seeing stars. |
| **Bomb** (circle, small) | 55 | Waddles up, lights its fuse and charges in screaming, then explodes: everything nearby is flung (teammates take half damage) and its googly eyes go bouncing off. Bombs wait for each other to get out of blast range; one right next to a blast goes off too. |
| **Brick** (rectangle, giant) | 240 | A walking brick wall about 1.7 times bean height, with an iron hammer. Slow and very hard to knock over; the hammer slam sends a shockwave along the ground that hops everything nearby into the air. |

Rock-paper-scissors: archers shoot clubbers before they arrive, clubbers bonk
squires over their shields, and squires walk through arrow rain under a raised
shield. The shapes slot in around that triangle: Spikers catch archers and
bombs but bounce off shields; bombs blow up clumps of melee (and hurt the giant
extra) but get shot or caught early; the Brick flattens melee but is slow
enough for archers and bombs to bring down. At equal gold the counter wins
almost every time but loses a good share of its health, and mixed armies beat
most single-type ones (checked with headless simulations).

Every shape uses the same wobbly ragdoll skeleton, scaled per unit (a stubby
ball, a small wedge, a giant block), so the shapes wobble, fly, flop and pile
up just like the beans. Bigger units shove smaller ones around, not the other
way round.


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
  screams, a smile when cheering, shocked eyes that turn into X's (tongue out)
  when dead.
- **Squash and stretch** follows the hips' vertical acceleration.
- **Bonks:** the clubber raises the club overhead, trembles for a beat, then
  steps into a swing that launches beans up and away with a cartwheel. Launched
  beans scream, stretch into sausages, windmill their arms and run in the air.
  Medium hits cause a stumble with windmilling arms; corpses give a last wobble
  and pile up.
- **Juice:** hit-stop on big hits, screen shake, comic starbursts and dirt
  clods, "BONK!" pop-ups, smooth slow motion (drawing blends between physics
  steps), a final-blow slow-mo that keeps the victim in the shot, and the
  winners hop and cheer.
- **Hand of god:** drag a bean to pick it up. It dangles and flails, and you
  can fling it.

## Modes

- **Campaign:** nine rounds (three of them introduce the Spiker, the Bomb and
  the Brick). Red's army is preset, and you have a gold budget for blue. **Retry** replays your placement; **Change army** lets you edit it.
  Beaten rounds can be replayed from the title card. Every round has several
  winning armies and loses to the obvious wrong answer (checked by simulating
  every affordable army).
- **Sandbox:** place both armies (left of the field is blue, right is red) with
  no budget. You can grab beans during the battle too.

Controls: pick one of the six unit cards, then tap or click your side of the
field to place it (a tap right next to a bean still places one). Drag a bean to
grab it (a lit bomb stays lit: throw it), drag elsewhere to pan, pinch or
scroll to zoom; 🎥 reframes. The 🐢 button toggles slow motion. The ≡ menu
pauses the battle. Keys: `1`–`6` pick a unit, `E` remove, `Space` fight, `S`
slow-mo, `F` auto camera, `R` reset, `M` mute, `Esc` menu / resume.

## Code map (battle/)

```
battle/index.html, style.css    page shell, storybook HUD, title, dock
battle/src/config.js             world layout + team colours shared by everything
battle/src/sim/physics.js        Verlet particles, constraints, ground, segment tests
battle/src/sim/unit.js           the ragdoll: skeleton, muscles, walking, attacks, pounce, fuse, eyes, AI
battle/src/sim/unit-types.js     the six units: shape, size, stats, weapons/abilities, attack poses
battle/src/sim/battle.js         placement, fixed-step sim, melee hits, pounces, shockwaves, explosions, arrows, win check
battle/src/campaign.js           the nine rounds
battle/src/render/units.js       drawing beans, bricks, wedges and balls, faces, weapons, arrows, fuses
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
- **Two levels**, picked on the title card or in the tuning panel:
  - **Streets:** a run across a dark city, from a safe room (bottom left) to
    the green safe room across town.
  - **Building:** one dark floor of an office/hospital-style building:
    corridors, offices, wards, cafeterias, lobbies, warehouse aisles and
    restrooms, all furnished. Hallways are blocked by barricades of piled
    furniture, so the route winds through rooms and doorways. Some offices
    have glass fronts, so you see the horde before it reaches the door, and
    some rooms are pitch dark. A shootable fire alarm is the indoor version
    of the car alarm.

  On both levels, a green arrow at the screen edge points to the safe room
  and shows the walking distance.
- **An AI Director**: build-up, peak and relax phases, wanderers, small groups,
  and mobs ("HERE THEY COME!") that spawn out of sight and come round corners.
  Shooting a car with a blinking red light sets off the **alarm**, which brings
  a three-wave panic event.
- **Massive hordes** for stress tests: in the tuning panel, **Horde size** goes
  up to ×25 (a log slider, so ×1–×3 still has fine steps), **Wanderer
  density** to ×10, and zombie speed and damage to ×2.5 and ×5. The zombie
  limit grows with the horde sliders (230 at the defaults, up to 3,000 alive),
  and big mobs pour in from several directions at once. Turn on **Debug
  read-out** to see the fps and how many zombies are alive out of the limit.
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

## Road to Evac: a metagame prototype

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

## Safehouse: another metagame prototype

[`safehouse/`](safehouse) is another separate page, built from the design doc
*Safehouse: Meta-Progression Design for a Co-op Zombie Mobile Game* and then
cut down to its core. It isn't connected to the action game or to the other
prototypes: a **PLAY** button runs a simulated mission in place of a real one.

- One screen: four rooms, each answering one question a squad asks before a
  mission. The Workshop is "what do we carry?", the Infirmary "how do we
  heal?", the Barracks "who comes with us?" and the Radio Room "where do we
  go next?". Next to them is the next mission with its chance and PLAY.
- One resource, Scrap. Missions bring it home, banked at every safe room, so
  a wipe keeps what you already brought in.
- Three levels per room on real-time timers, one upgrade at a time. Every
  level makes the squad stronger.
- Crafted throwables and heals go along on the next mission. Unused ones stay
  in the crate.
- Three named survivors: Nadia from the start, Theo and Grace rescued in
  chapter finales. They move in once the Barracks has a bunk.
- Twelve missions in four chapters, and a one-line hint for what to do next.

The gear (top right) has testing tools: skip time, add Scrap, force outcomes,
reset. Open `/safehouse/` (on Pages:
`https://miikka-boom.github.io/FunLand2/safehouse/`). The rules, numbers and
what was cut from the design doc are in [docs/SAFEHOUSE.md](docs/SAFEHOUSE.md).

## Run it

- **GitHub Pages:** `https://miikka-boom.github.io/FunLand2/` (HORDE) once
  this is on the default branch (the Pages workflow only deploys from there).
  WOBBLE WAR is at `/battle/`, and the metagame prototypes are at `/evac/`
  (Road to Evac), `/safehouse/` (the Safehouse) and `/camp/` (the v1 camp).
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
src/world/                 seeded city + building generators, collision, ray casts, flow field
src/game/                  player, weapons, zombies, director, effects, game state
src/render/                renderer, lighting (night + LOS), HUD
src/audio.js               WebAudio synth SFX
battle/                    WOBBLE WAR battle simulator (separate page; code map above)
evac/                      Road to Evac metagame prototype (separate page; map in docs/METAGAME.md)
safehouse/                 Safehouse metagame prototype (separate page; map in docs/SAFEHOUSE.md)
camp/                      v1 camp metagame prototype (separate page; map in docs/METAGAME-CAMP.md)
tests/                     node --test unit tests (stick math, touch controller rules, horde scaling, the three metagames, battle sim)
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
