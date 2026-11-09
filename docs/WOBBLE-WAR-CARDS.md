# Wobble War: Arena — the 32 cards (build contract)

This is the build contract for growing Wobble War: Arena from 14 to **32 cards**:
18 new cards, a 4th rarity (Legendary), an air layer, buildings, deploy-anywhere
units and new spells. Several engineers build it in parallel (sim, render,
bot/meta, integration, balance), so everything shared is pinned down here:
card and unit fields, rules, entity fields, events, function signatures, file
ownership and tests.

It extends `docs/WOBBLE-WAR-ARENA.md` (the design spec). Its principles and
engineering rules still hold: original names only, no money, determinism (sim
`Rng` only), 120 Hz fixed step, plain ES modules, no dependencies.

**Every number here is a starting value.** Tune numbers with
`battle/tools/balance-arena.mjs` (and `--set`). Don't change rules, field names,
event names or file ownership without updating this document.

Contents:

1. Summary table of the 32 cards
2. The arenas
3. Global rules (air, buildings, deploy-anywhere, statuses, holding, spawns, damage)
4. The 18 new cards, one by one
5. Changes to existing cards
6. Engine features and interfaces
7. Legendary rarity and the meta game
8. Bot
9. Build plan: workstreams, file ownership, order
10. Test plan and balance targets
11. Open risks and fallbacks
12. Appendix: how the three proposals scored, and what was taken from each

---

## 1. Summary of all 32 cards (CARD_ORDER order)

**Flags:** U unit · S spell · B building · F flying · A deploy-anywhere · AA hits high air · SO structures only · T trap or zone that persists · O helps your own side.

**Count:** beans per card for units, and what the building spawns or does for buildings. The 14 existing ids and their order are unchanged. The new cards follow, grouped by arena and ordered by rarity within each arena.

| # | id | Name | Kind / flags | Rarity | Arena | Mana | Count |
| ---: | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | `clubbers` | Clubbers | U | common | 0 | 3 | 2 |
| 2 | `squire` | Squire | U | common | 0 | 3 | 1 |
| 3 | `archers` | Archers | U · AA | common | 0 | 3 | 2 |
| 4 | `spikers` | Spikers | U | common | 0 | 2 | 3 |
| 5 | `bomb` | Bomb | U | common | 0 | 2 | 1 |
| 6 | `arrowRain` | Arrow Rain | S · AA | common | 0 | 3 | – |
| 7 | `boulder` | Boulder | S | rare | 0 | 4 | – |
| 8 | `clubberGang` | Clubber Gang | U | rare | 0 | 5 | 4 |
| 9 | `bruiser` | Bruiser | U | rare | 1 | 4 | 1 |
| 10 | `brick` | Brick | U · SO | epic | 1 | 5 | 1 |
| 11 | `cheeseWheel` | Cheese Wheel | S | epic | 1 | 3 | – |
| 12 | `bombSquad` | Bomb Squad | U | rare | 2 | 4 | 3 |
| 13 | `megaBomb` | Mega Bomb | U | epic | 2 | 3 | 1 |
| 14 | `shieldWall` | Shield Wall | U | epic | 2 | 7 | 3 |
| 15 | `sprouts` | **Sprouts** | U | common | 0 | 1 | 2 |
| 16 | `bananaPeels` | **Banana Peels** | S · T | common | 0 | 2 | 5 peels |
| 17 | `propellerPals` | **Propeller Pals** | U · F | common | 1 | 3 | 3 |
| 18 | `pogoBean` | **Pogo Bean** | U · SO | rare | 1 | 4 | 1 |
| 19 | `netter` | **Butterfly Netter** | U · AA | rare | 1 | 3 | 1 |
| 20 | `bigSneeze` | **Big Sneeze** | S · AA | common | 2 | 2 | – |
| 21 | `shakenSoda` | **Shaken Soda** | S · AA | epic | 2 | 3 | – |
| 22 | `bombJuggler` | **Bomb Juggler** | U · AA | legendary | 2 | 5 | 1 |
| 23 | `boingBox` | **Boing Box** | B (defensive) | common | 3 | 3 | punches |
| 24 | `beanPatch` | **Bean Patch** | B (spawner) | rare | 3 | 4 | Sprouts |
| 25 | `anvil` | **Anvil** | S · AA | rare | 3 | 4 | – |
| 26 | `nutcracker` | **Nutcracker** | U | epic | 3 | 4 | 1 |
| 27 | `wreckingCrane` | **Wrecking Crane** | B (defensive) | legendary | 3 | 6 | swings |
| 28 | `brollyBrigade` | **Brolly Brigade** | U · A | rare | 4 | 4 | 3 |
| 29 | `bubbleWrap` | **Bubble Wrap** | S · O | epic | 4 | 3 | – |
| 30 | `tummyDrummer` | **Tummy Drummer** | U (support) | epic | 4 | 4 | 1 |
| 31 | `pelican` | **Pelican** | U · F | legendary | 4 | 5 | 1 |
| 32 | `bigJelly` | **Big Jelly** | U | legendary | 4 | 6 | 1 |

**Constraint check**

| Constraint | How the set meets it |
| --- | --- |
| Total cards | 18 new, 32 in all |
| New cards per arena | 2 / 3 / 3 / 5 / 5, so arena totals are 10 / 6 / 6 / 5 / 5 |
| New cards by rarity | 5 common, 5 rare, 4 epic, 4 legendary |
| Rarity across all 32 | 11 common, 9 rare, 8 epic, 4 legendary |
| Legendaries in arenas 0–1 | None. They sit in arenas 2, 3, 4 and 4 |
| Flying cards | 2: Propeller Pals and Pelican. Brollies also count as air while they float down |
| Buildings | 3: Bean Patch (spawner), Boing Box (defensive), Wrecking Crane (defensive) |
| New spells | 5: Banana Peels (trap that lasts 8 s), Big Sneeze, Shaken Soda, Anvil, Bubble Wrap (helps your side) |
| Deploy-anywhere | 1: Brolly Brigade |
| New unit types | 10: `sprout`, `copter`, `pogo`, `netter`, `juggler`, `nutcracker`, `brolly`, `drummer`, `pelican`, `jelly` |
| New body shapes | 2: `bird` and `jelly` |
| Cards that are only a new count of an existing unit | 0 |
| Mana | New cards cost 1–6 (average 3.67); all 32 cost 1–7 |

---

## 2. The arenas

| # | Arena (trophies) | Identity: the new decision it adds | New cards |
| --- | --- | --- | --- |
| 0 | Green Hills (0) | **Picnic pranks.** Cheap tricks that teach trades and timing: a 1-mana bait and the first trap | Sprouts, Banana Peels |
| 1 | Pointy Pass (300) | **Up and over.** Win conditions that skip the front line (Pogo Bean hops over it, Propeller Pals fly over it) and the first unit that brings fliers down (Butterfly Netter). The air layer opens here | Propeller Pals, Pogo Bean, Butterfly Netter |
| 2 | Boom Ridge (650) | **Launch day.** Everything goes up: ACHOO, POP, BOOM. Cheap resets, a delayed geyser, a bomb lobber that hits air | Big Sneeze, Shaken Soda, Bomb Juggler |
| 3 | Brick Fortress (1000) | **Build and break.** Buildings arrive (punch, spawn, swing) together with what breaks them (Anvil, Nutcracker). The Brick now hunts buildings too | Boing Box, Bean Patch, Anvil, Nutcracker, Wrecking Crane |
| 4 | Wobble Summit (1500) | **The big show.** Combined-arms pushes (a tank, a buff, protection) against units that pick pushes apart from the sky or from anywhere | Brolly Brigade, Bubble Wrap, Tummy Drummer, Pelican, Big Jelly |

Each arena's full card list (for `cardsUpTo`, the Trail and the UI) follows from `card.arena`. The table in section 1 is the source.

---

## 3. Global rules (the contract every stream relies on)

### 3.1 Sizes and numbers to compare against

| Thing | Values |
| --- | --- |
| Clubber | hp 110, club 28 per ~1.3 s, speed 64, R 14.5, bodyLen 25, standing hip about 30 px up, head top about −69 px. At zoom 0.43 that is about 27–30 px on screen |
| A Clubber's raised club | reaches about y = −105 |
| Guard Tower | 420 hp, w 64, h 150 (roof at y = −150), range 300, bolts of 10 every 0.8 s |
| Castle | 700 hp, w 170, h 150. It is a wall all the way up |
| Coordinates | y grows down, ground at 0, lanes 0..18 px deep |

### 3.2 The air layer

A unit's **altitude** is `u.alt = (u.ground − u.standH) − u.hip.y`, the height of its hip above its own standing hip height. It is a getter in `unit.js`.

```js
export const AIR_MIN = 60; // unit-types.js
get air() { return this.alive && !this.held && (!!this.type.flying || this.floatT > 0) && this.alt > AIR_MIN; }
```

**Two layers.** A unit with `u.air === true` is **high**: only "hits air" sources can target or hit it. Every other unit is on the ground, including a flier that dives, swoops, gets netted or is stunned below 60 px. A low flier is a normal target for everyone. That gives the earned "Clubber bats it out of the sky" moments.

**Who hits high air**

| Hits high air | Cannot hit high air |
| --- | --- |
| Archers (`hitsAir: true` is added to `archer`) | Clubbers, Clubber Gang, Squire, Shield Wall, Bruiser, Brick (hammer and quake), Spikers (pounce), Sprouts, Pogo Bean, Nutcracker, Brolly (on the ground), Big Jelly, Tummy Drummer |
| Bomb Juggler: its bombs lob at fliers and burst on contact | Propeller Pals and Pelican: fliers never target fliers |
| Butterfly Netter: only fliers whose hip is at most `airReach` = 130 px above the ground (Propeller Pals at cruise, a falling Brolly, a swooping Pelican; not a Pelican at cruise height) | Cheese Wheel, Banana Peels, Boing Box, quakes (these already skip beans in the air) |
| Guard Tower bolts and Castle cannonballs. Towers already pick the nearest unit by x, air included, and aim at the chest; this stays as it is | |
| Spells: Arrow Rain (by x band, already), Big Sneeze (×1.8 shove), Shaken Soda, Anvil (anything in its column at any height) | |
| By distance, as today: Bomb blast (r 115, grazes fliers up to about 90 px up), Mega Bomb blast (r 170), Juggler bombs (r 65), the Wrecking Crane's ball (sweeps up to about 110 px), and the Boulder only if its rock passes near (rare) | |

**Air answers in every arena.** Arena 0 has Archers, Arrow Rain and the towers. Arena 1 adds the Netter. Arena 2 adds the Juggler, Sneeze and Soda. Arena 3 adds the Anvil. No flier is above 320 hp, and no flier targets other fliers.

**How fliers move** (`unit.js` `control()`, for any `type.flying`). The hip support spring is replaced by a **lift** that can push and pull:

```js
const LIFT_K = 260, LIFT_C = 14;                         // unit.js
const want = this.altWant ?? this.type.flying.alt;        // mechanics (dive, swoop, carry) override altWant
const ty = this.ground - this.standH - want + Math.sin(this.time * 2.2) * this.type.flying.bob;
let fy = this.supportMass * (LIFT_K * (ty - hip.y) - LIFT_C * hipVy - G);
fy = clamp(fy, -4 * G * this.supportMass, 1.5 * G * this.supportMass);
hip.fy += fy * m * (this.liftOffT > 0 || !this.alive ? 0 : 1);   // m = conscious: stunned fliers sag
```

- **Horizontal.** The normal walk drive, with the ground factor `gF` forced to 1. While the lift is on, a flier reports `groundF = 1`, so `think()`'s `startAttack` condition (`groundF > 0.6`) holds in the air. With the lift off (`liftOffT`, knocked down, dead) `groundF` is computed normally.
- **Legs.** Fliers always use the existing "airborne cartoon run" leg branch at half rate (lazy paddling). They never plant feet and never emit `step`.
- **Upright pull** as normal. A flier's pose `lean` can tilt it; the Pelican flies leaning ~1.1 rad, nearly horizontal.
- **Contact with ground beans.** None needed: `separate()` already skips pairs more than 34 px apart in y. Enemy fliers at the same height push each other as usual.
- **Tower walls are unchanged and physical.** Parts below a tower's roof are pushed out. Propeller Pals at alt 100 (head top about −147) **stop at a Guard Tower's face** and dive at it. A Pelican at alt 160 passes over Guard Towers and buildings. A Castle is a wall all the way up, so nothing ever gets behind it.
- **Knocked down** (stun ≥ 0.85 or conscious < 0.12). The lift sags with `conscious`, so the flier drops, lands, gets up dizzy, and the lift brings it back up as `conscious` recovers.
- **Dead.** The lift is 0 and it falls with gravity. On the first body contact with the ground at impact > 320 it emits `crash {unit, power}`. A crash deals no damage. The corpse fades like any other.
- **Fall damage.** None while the lift is on. A netted or knocked-down flier takes normal fall damage (that is the point of the net).
- **`liftOffT`.** Any mechanic may switch the lift off for a while (net, anvil, soda). Its timer never stacks beyond its largest value.

**Targeting** (`battle.js` `findArenaTarget`):

```js
canTarget(u, e) {           // battle.js, exported helper used by findArenaTarget and the bot
  if (!e.alive || e.held) return false;               // held units (Pelican beak, inside a jelly) are not targets
  if (!e.air) return true;
  if (!u.type.hitsAir) return false;
  return !u.type.airReach || e.ground - e.hip.y <= u.type.airReach;
}
```

**Hits.** `resolveMelee`, `resolveDash`, the bite, the stomp, the Boing Box punch and the Jelly bump skip `e.air` targets, unless the attacker has `hitsAir` (the Netter). Arrows, bolts, cannonballs and blasts stay purely physical: whatever they touch, they hit.

### 3.3 Buildings

A building is a **`Tower` with `kind: 'building'`**. It lives in `battle.towers`, so walls (`towerWalls`), melee against towers (`meleeTower`), pounces, arrows (`stickInTower`), blasts, quakes, spells and the cheese wheel all reach it with no new code. A building is a wall to enemy bodies. Teammates walk past their own.

**Placement** (`Match.canPlay` / `play`):

- **Zone.** Only inside your own `WORLD.deploy[team]`, never in the pocket, even after the enemy Guard Tower falls.
- **Fitting.** `fitBuilding(battle, team, bid, x)` (in `sim/buildings.js`) returns a legal centre x or `null`. It searches from x outward in 4 px steps up to `BUILD_SNAP = 80`. The first x wins where the footprint `[x − w/2, x + w/2]` is inside the deploy zone and at least `BUILD_GAP = 12` px from every standing tower and building of either team. `null` makes `canPlay` return `'zone'`.
- **Cap.** At most **`MAX_BUILDINGS = 3` standing buildings per side.** Playing a 4th makes the oldest one crumble (`destroyTower(b, oldest, true)`, cause `'crumbled'`).
- A building card places exactly one building. `Match.formation()` returns `[fitX]` for ghosts, or `[]` when the spot is illegal.

**Arrival.** `battle.addBuilding(bid, team, x, level)` creates it at once: it is solid and can be damaged from the first step.

- **Drop.** For `landT` 0 → 0.35 s the renderer draws it falling from 300 px up as a crate (the patch as a clod of dirt). At 0.35 s it emits `buildingLand`. Enemy beans whose hips are inside the footprint then get `addVel(0, −220)`; `towerWalls` already pushes them out sideways. There is no damage.
- **Arming.** It starts working (punch, spawn, pump) `arm = 1.0` s after placement, the same as a unit's deploy time.

**Lifetime.** `t.hp -= t.maxHp / def.life * dt` every step from placement, silently: no events and no damage numbers. At 0 it is destroyed with cause `'decayed'`. The HP bar shows a small clock pie (`t.age / def.life`).

**Who attacks buildings**

- **Every ground unit, when no bean is in sight.** The old rule "march to the next enemy tower" becomes **"go for the nearest standing enemy structure along x"** (towers and buildings), so a building in front of your Guard Tower pulls attackers to it.
- `towerBetween(team, x0, x1)` counts buildings, so melee won't chase beans standing behind an enemy building.
- **Structures-only units** (`targets: 'structures'`): the **Brick** (changed from `'towers'`) and the **Pogo Bean**. Buildings are the classic lever against them.
- **Fliers** attack buildings like towers. Spells and blasts hit them.
- **Towers never shoot buildings.** They shoot units only, as today.
- **Ranged fix in `Unit.think()`.** The rule `Math.min(preferRange, t.range − t.w/2 − 25)` applies only to real towers (`t.kind !== 'building'`). Otherwise Archers would walk into a range-0 building.

**Damage taken** (`sim/buildings.js`):

```js
export const BUILDING_TAKES = { melee: 1, spike: 1, arrow: 1, blast: 0.75, quake: 0.75, spell: 0.75 }; // wood (stone: 0.5)
export function takesOf(t, kind, override) {   // towers.js (re-exported); replaces every direct TOWER_TAKES.x read
  if (t.kind === 'building') return BUILDING_TAKES[kind] ?? 1;
  return override ?? TOWER_TAKES[kind] ?? 1;   // override = X.vsTower / Q.vsTower / attack.vsTower (stone only)
}
```

**Never crowns.**

- `destroyTower(b, t, crumble)` has an early building branch. It sets `alive = false`, `hp = 0`, `downT = 0` and marks its arrows to fade. It emits **`buildingDown {tower, team, bid, cause}`** and **never `towerDown`**. It gives no crowns and wakes no castle.
- `damageTower` never calls `wakeTower` for a building (buildings are `active: true` anyway).
- `Match.weakest()` and the tiebreak skip buildings. Overtime is decided by crowns only, so destroying a building ends nothing.
- When a side's Castle falls, the existing crumble loop also crumbles that side's buildings (cause `'crumbled'`).
- The bot's `towers.mine/theirs` exclude buildings.
- `reap()` removes a building from `battle.towers` once `downT > 3` s.

**Level.** A building's hp, its damage and the level of the units it spawns all follow the card level (`levelMul`).

### 3.4 Deploy-anywhere (Brolly Brigade)

- **Card flag.** `anywhere: true`.
- **Where it can be played.** `Match.canPlay` accepts x in `[40, 1460]` for these cards, at any time.
- **Formation.** `Match.formation()` takes the card's `spread` offsets around x. It nudges each x out of every standing tower or building footprint (`|x − t.x| < t.w/2 + 16` moves it to the nearer side, at `t.x ± (t.w/2 + 16)`), out of both Castles' rectangles (to the field side), then clamps it to `[40, 1460]`.
- **Deploy.** `addUnit(card.unit, team, x, lane, seed, { level, float: true })` calls `battle.floatIn(u)` instead of `dropIn(u)`.
- **Towers can shoot them.** Floating units are not `dropping`, so towers can shoot them all the way down. That is the counterplay.

### 3.5 Statuses (fields on `Unit`, all 0 by default, counted down in `post()`)

| Field | Set by | Effect |
| --- | --- | --- |
| `shoveT` | any hit with `hit.shove: true` (Big Sneeze, Boing Box punch, Wrecking Crane, Jelly spit) | **Anti-lock.** If `shoveT > 0` when a shove lands, its `dvx/dvy` are ×0.25 and its stun ×0.3. Then `shoveT = 1.6`. Nothing can keep one bean bouncing out of play |
| `slipImmuneT` | Banana Peel slip (set when the bean gets up: 1.5 s) | can't slip again |
| `liftOffT` | Netter (1.8), Anvil (1.2), Shaken Soda (0.6) | flier lift = 0 |
| `netImmuneT` | Netter (3.0) | a new net hit gives only the ground payload (no `liftOff`) |
| `beatT` | Tummy Drummer (0.6 per beat) | `tempo()` = 1.3, `moveMul()` = 1.3 |
| `wrapHp`, `wrapMax`, `wrapT` | Bubble Wrap | absorbs damage first; stun ×0.5; no fall damage; body bounce 0.6 |
| `squashT` | Anvil (1.0) | render: pancake squash; the bean is `downT` anyway |
| `floatT`, `flipped` | Brolly (`floatIn`) | drag-capped fall; `air` while high; `flipped` = umbrella inside out |
| `held`, `heldBy`, `holding` | Pelican, Big Jelly | see 3.6 |
| `spawnOf` | Bean Patch spawns | id of the building that spawned it |
| `dropSlam` | Pelican release | takes `dropDamage` on the first ground impact > 320 |

**Speed and tempo helpers** (`unit.js`). They must be **exact no-ops** (×1) when no status is active, so golden replays stay bit-identical:

```js
tempo() { return this.beatT > 0 ? BEAT.tempo : 1; }      // BEAT from unit-types.js: { tempo: 1.3, move: 1.3 }
moveMul() { return this.beatT > 0 ? BEAT.move : 1; }
```

- **Where `tempo()` applies.** `a.t` in `animate()`, `animateDash()` (windup and recover only, never the flight), `animateBow()`, the Juggler toss, the Nutcracker bite, the Pelican and Jelly act timers, `cooldown` countdown, and Pogo hop rest.
- **Where it never applies.** Fuses (`a.phase === 'fuse'` and `deathFuse`), `deployT`, `downT`, dash flight time, and building timers.
- **`moveMul()`** multiplies `this.speed` everywhere `think()` uses it.

### 3.6 Holding (Pelican beak, Big Jelly)

This is the hand-of-god grab, generalised to units. The grab already runs `springTo(g.p, x, y, 900, 48, dt, …)` every step, and those constants behave well.

```js
battle.hold(holder, v)            // battle.js: v.held = true; v.heldBy = holder; holder.holding = v; v.act = null (a lit fuse stays lit); emits nothing (callers emit)
battle.letGo(v, dvx = 0, dvy = 0) // battle.js: clears held/heldBy/holding, adds velocity to every part of v
// every step, right after the "hand of god" spring, for each unit H with H.holding:
const [ax, ay] = H.holdPoint();   // unit.js: Pelican beak tip / Jelly chest
springTo(v.chest, ax, ay, 900, 48, dt, ((v.supportMass + 1) / v.chest.mass) * 0.55);
```

- **The held unit.** `v.held` is the existing field, so `think()` already stops it and `control()` gives it `wake = 0.3`: it flails.
- **Not a target.** Held units are skipped by targeting (`canTarget`). Physical things (blasts, arrows) still hit them.
- **No pushing.** `separate()` skips any pair that contains a held unit.
- **Release.** `removeUnit`, `die` and `explode` of either partner call `letGo`.
- **Only light units can be held:** `mass <= 1.0`, alive, on the ground (not `air`), `deployT <= 0`, not held, not floating, not a flier, not a building.

**Masses that matter**

| Group | Units |
| --- | --- |
| **Liftable** (mass ≤ 1.0) | Clubber, Squire, Archer, Spiker, Bomb, Sprout, Pogo, Netter, Juggler, Brolly, Drummer |
| **Not liftable** | Bruiser (2.2), Brick (4), Mega Bomb (1.8), Nutcracker (1.3), Big Jelly (3.2) |
| **Heavy** (mass ≥ 3: skid on peels, the bomb's `vsGiant` bonus) | Brick, Big Jelly |

### 3.7 Spawns, caps and the deferred queue

`addUnit()` re-sorts `battle.units`. Adding a unit from inside a loop over units (`resolveMelee`, `explode`, `takeHit` → `die`) would corrupt that loop. So **every mid-step spawn is deferred.**

```js
battle.pending = [];                         // closures, run FIFO at the very end of Battle.step() (after post() and reap())
battle.later(fn)                             // push a closure
battle.spawn(typeId, team, x, opts)          // = later(() => ...): addUnit (no drop) + pop velocity + deployT + bookkeeping; skipped above MAX_LIVE
  // opts: { level, lane?, seed?, pop: [vx, vy] (px/s, vx already signed), deployT, from: Tower|Unit|null }
export const MAX_LIVE = 32;                  // per side, live units; spawns (not cards) are skipped above it
```

- **Spawned units.** A spawned unit is not `dropping`: towers may shoot it at once. While `deployT > 0` it takes no fall damage. It has no battle-cry hop.
- **Seeds.** The spawn's lane and seed come from `battle.rng`, drawn when the closure runs, in FIFO order, so replays stay deterministic.
- **Caps.**

  | What | Limit |
  | --- | --- |
  | Live Sprouts per Bean Patch | 3 |
  | Live units per side (spawns only) | 32 (`MAX_LIVE`) |
  | Standing buildings per side | 3 |
  | Juggler bombs in flight per Juggler | 3 |
  | Peels per cast | 5, with at most 10 slips |
  | Units held per holder | 1 |

### 3.8 Damage kinds and multipliers

| kind | Tower takes | Building takes | Sources |
| --- | --- | --- | --- |
| `melee` (club, sword, net, brolly, bite, bump, pogo) | 1 (bite ×0.5 via `attack.vsTower`) | 1 | weapons, Nutcracker, Jelly bump, Pogo bonk |
| `spike` | 1 (peck ×0.5 via `dash.vsTower`) | 1 | Spiker, Propeller Pals dive, Pelican peck |
| `arrow` | 1 | 1 | arrows, bolts |
| `blast` | 0.5 (or `X.vsTower`) | 0.75 | bombs, Juggler bombs |
| `quake` | 0.5 | 0.75 | Brick |
| `spell` | 0.5 | 0.75 | every spell |

### 3.9 Lock-out check (nothing shuts a side out of play)

| Card | What limits it |
| --- | --- |
| Banana Peels | at most 10 slips per cast; 1.5 s of slip immunity after getting up; heavies only skid; fliers never slip |
| Boing Box, Wrecking Crane, Big Sneeze | `shoveT`: a second shove within 1.6 s is ×0.25. The Box recharges for 1.9 s; the Crane must re-pump after every hit |
| Butterfly Netter | 3 s of `netImmuneT` after a net; `liftOffT` never stacks |
| Pelican | one bean at a time, carried 2.0 s at most, then 3.5 s of cooldown; heavies can't be lifted; many ways to make it drop (3.6, card 31) |
| Big Jelly | one bean at a time for 2.2 s, then 1.5 s of cooldown |
| Air | towers and Arrow Rain hit air from Arena 0; Archers too; fliers are fragile |
| Brolly Brigade | 2.7 s of visible descent while towers shoot it; not inside Castle rectangles |
| Shaken Soda | a 1.2 s warning; it fires once |

---

## 4. The 18 new cards

**How each card is laid out.**

- **Card fields** are written exactly as they go into `sim/cards.js`.
- **Unit types** go into `sim/unit-types.js`, building constants into `sim/buildings.js`, and spell constants into `SPELLS` in `sim/spells.js`.
- **Poses** are starting points. Tune them by eye in the sandbox.
- **Desc** is at most 80 characters (tested).
- **Sizes** are given relative to the Clubber (R 14.5, bodyLen 25).

### Arena 0: Green Hills

#### 15. Sprouts (`sprouts`): the 1-mana bait

```js
sprouts: { id: 'sprouts', name: 'Sprouts', kind: 'unit', unit: 'sprout', count: 2, spread: [-10, 10], mana: 1, rarity: 'common', arena: 0,
  desc: 'Two tiny sprouts with toothpicks. One bonk sends them to the moon.' },
```

```js
sprout: {
  id: 'sprout', name: 'Sprout', shape: 'bean', blurb: 'Tiny, fast and brave. Wears a leaf.', cost: 25,
  hp: 36, radius: 9, bodyLen: 15, speed: 96, mass: 0.45, heft: 1.5, heftUp: 1.35,
  weapon: 'sword', weaponScale: 0.5,                 // a toothpick (len 15)
  body: { thigh: 9.5, shin: 9.5, upperArm: 6.5, foreArm: 6.5 },
  noHat: true,                                       // the leaves are its hat
  engage: 24, reach: 32,
  attack: { windup: 0.16, strike: 0.08, recover: 0.18, cooldown: 0.22, damage: 11, knock: 90, stun: 0.15, shieldPierce: 0.35, cleave: false },
  poses: { // the Squire's stab, ×0.6
    rest: { main: [4, -4], off: [6, 0], ang: -38, lean: 0.05, crouch: 0, wk: 1 },
    windup: { main: [-4, -2], off: [6, 1], ang: -8, lean: -0.2, crouch: 2, wk: 1.4 },
    strike: { main: [13, -2], off: [6, 1], ang: 2, lean: 0.3, crouch: -1, wk: 2.6, hk: 2.2 },
    cheer: { main: [2, 10], off: [5, 4], ang: -85, lean: -0.05, crouch: 0, wk: 1 } },
},
```

- **Behaviour.** A standard melee bean: the nearest enemy ground bean in sight, else the nearest structure. It is also what the **Bean Patch** spawns.
- **Physics beat.** It weighs nothing (mass 0.45, heft 1.5), so any club hit sends it cartwheeling half the field, squeaking. It bounces, gets up and sprints straight back in. Two Sprouts poking a Brick's ankles while it ignores them.
- **Job.** Cycle and bait. For 1 mana it soaks a Bruiser's windup, a Nutcracker bite, a Bomb's fuse or a Pelican scoop. It pulls the Guard Tower's aim off a push and finishes an Archer.
- **Counters.** Any splash (Arrow Rain, Big Sneeze, Bomb, Juggler, Clubbers' cleave), tower bolts (4 each), Boing Box.
- **Art.** A tiny team-colour bean (about 18 px on a phone) with **two big bright-green leaves** (`#5fbf3a`, dark `#2f7a1e`) on a short stem from the head top. They flap when it runs and wilt when it dies. The toothpick is pale wood `#d9b26a` with a green olive at the tip.
- **Card art.** Two Sprouts mid-charge, toothpicks forward, leaves streaming.

#### 16. Banana Peels (`bananaPeels`): the first trap

```js
bananaPeels: { id: 'bananaPeels', name: 'Banana Peels', kind: 'spell', spell: 'bananaPeels', radius: 90, mana: 2, rarity: 'common', arena: 0,
  desc: 'Five banana peels. Whoever steps on one goes feet-up. A classic.' },
```

```js
// SPELLS (spells.js)
bananaPeels: { peels: 5, toss: 0.4, life: 8, uses: 2, maxSlips: 10, trigger: 9, laneTol: 8, damage: 8,
  feet: 260, head: 180, hipUp: 160, immune: 1.5, kick: 170, heavyMass: 3, skid: 120, skidWobble: 0.4, minAge: 0.4 },
```

**Cast.** It creates a `peels` entity, `{ kind: 'peels', team, f, x, y, t, radius, slips: 0, done }`. Peels are **physical items** in `battle.items`:

```js
{ kind: 'peel', team, a, b, con, age: 0, life: 8, uses: 2, used: false, laneY }
```

- **The toss.** The 5 peels are tossed in from 260 px above, spread evenly across `[x − radius, x + radius]` with `b.rng` jitter, each on a random lane (`laneY = WORLD.groundY + rng·laneDepth`; the particles' `ground` = `laneY`). They land after about 0.4 s.
- **Fading.** `reap()` fades an item at `it.life ?? ITEM_FADE_AT`; this `life` override is new.
- **Blasts move them.** Quakes, blasts and the Boulder already push items, so they fling peels around, and a flung peel works again wherever it lands.

**Slip check** (`spells.js` `updatePeels(b, dt)`). It runs while any peel item exists.

- **A peel is active** while its age ≥ `minAge`, both particles are on the ground, and its speed is below 40 px/s.
- **Who can slip.** Each enemy unit that is alive, not `gone`, `deployT ≤ 0`, `slipImmuneT ≤ 0`, not `air`, not held, and has `groundF > 0.8`.
- **The trigger.** For each foot i: if `u.feet[i].plant`, `|u.foot[i].x − peelX| ≤ trigger` and `|u.ground − peel.laneY| ≤ laneTol`, then `u.slip(b, peel)`.
- **Pogo.** A Pogo slips when its stick tip *lands* within `trigger` px of a peel.

**`Unit.slip(b, peel)`** (`unit.js`). Here `dir` = the unit's walking direction (its `f`).

- **The slip.** Feet and knees get `addVel(dir·feet, −220)`, head and chest `addVel(−dir·head, −60)`, the hip `addVel(dir·60, −hipUp)`.
- **The hit.** Then `takeHit(b, { damage: damage·dmgMul(caster), dvx: 0, dvy: 0, stun: 1.0, kind: 'slip', x, y })`. That floors it, with the existing `downT` roll of about 1 s. When it gets up, `slipImmuneT = immune`.
- **Heavies** (`mass ≥ heavyMass`: Brick, Big Jelly) don't fall. They skid: hip `addVel(dir·skid, 0)` and `wobbleT = skidWobble`, with no damage.
- **Events.** `slip {unit}`, or `skid {unit}`.

**The peel afterwards.** A peel that tripped someone is kicked backward: `addVel(−dir·kick, −120)` with spin, and `peelKick` is emitted. Its `uses` drops by 1, and it turns brown (`used`). At 0 uses it fades. A cast never trips more than `maxSlips` beans in total.

- **Physics beat.** The classic slip: feet straight up, a beat lying flat in mid-air, WHUMP, hat off, stars. The kicked peel smacks into the next bean in line, and a charging Clubber Gang goes down like dominoes.
- **Job.** The cheapest stall in the game. Cast it in front of your Guard Tower so a push trips inside tower range: every slip is about 1 s of free bolts. Or drop it under a Pogo's landing spot.
- **Counters.** Fliers and units that don't walk over it (ranged units stop short). Any blast or quake sweeps the peels away. A cheap Sprout or Spiker first eats the slips. Heavies only skid. It does almost no damage.
- **Art.** Yellow peels `#f5d33b` with brown tips `#8a5a1e`, three floppy lobes (about 7 px on a phone, so draw them chunky with a dark outline). Used peels are `#b88a2e`. The aim circle shows 5 peel icons.
- **Card art.** One big peel in front, two legs sticking up out of the frame behind it, motion lines.

### Arena 1: Pointy Pass

#### 17. Propeller Pals (`propellerPals`): the first fliers

```js
propellerPals: { id: 'propellerPals', name: 'Propeller Pals', kind: 'unit', unit: 'copter', count: 3, spread: [-24, 0, 24], flying: true,
  mana: 3, rarity: 'common', arena: 1, desc: 'Three beans in propeller caps. Turns out they DO fly. Heads first!' },
```

```js
copter: {
  id: 'copter', name: 'Propeller Pal', shape: 'bean', blurb: 'The propeller cap works. Dive-bonks heads.', cost: 40,
  hp: 60, radius: 10.5, bodyLen: 18, speed: 78, mass: 0.55, heft: 1.4, heftUp: 1.3,  // light: a club bat is a home run
  weapon: 'none', noHat: true, body: { thigh: 10, shin: 10, upperArm: 7, foreArm: 7 },
  flying: { alt: 100, bob: 8 },
  engage: 40, reach: 95,                           // hovers ~40 px short of its target (along x), dives from up to 95 px
  dash: { kind: 'dive', windup: 0.35, climb: 26, speed: 380, time: 0.5, recover: 0.6, cooldown: 0.7,
    damage: 22, launch: [150, 120], stun: 0.35 },
  poses: {
    rest: { main: [6, -6], off: [-4, -6], ang: 0, lean: 0.1, crouch: 0, wk: 1 },
    windup: { main: [-6, 6], off: [-8, 6], ang: 0, lean: -0.3, crouch: 0, wk: 1 },    // rears up
    dash: { main: [-9, -2], off: [-9, -4], ang: 0, lean: 1.3, crouch: 0, wk: 1 },     // head-first, arms back
    cheer: { main: [3, 10], off: [-1, 10], ang: 0, lean: -0.05, crouch: 0, wk: 1 } },
},
```

- **Deploy.** It drops in like any unit (`dropIn`). As soon as the lift engages, the propeller catches it at about 160 px and it rises or settles to alt 100.
- **Targets.** Ground units and structures. Never air (`hitsAir` absent).

**The dive-bonk** (`dash.kind: 'dive'` in `animateDash`):

1. **Windup.** It climbs, `altWant = alt + climb`, over `windup`.
2. **Dive.** `liftOffT = time`. Every part gets `setVel` toward the target's head (or the tower's face at mid-height) at `speed`. `striking = true`, and `resolveDash` works as it does for the Spiker. On a hit it rebounds with `setVel(−f·120, −260)`.
3. **Recover.** The lift comes back on to cruise alt.

At the bottom of a dive it is **below `AIR_MIN` for about 0.25 s**, so melee may target it and the swing decides the hit. A club hit on something this light (heft 1.4) is a home run.

- **Death.** The lift goes off and the bean drops like a stone. The cap pops off as an `fxRng` item (`kind: 'propCap'`) that spins up and away, then flutters down like a maple seed. Emits `propOff {unit}`.
- **Physics beat.** Three tiny beans sputter in and bonk heads like woodpeckers. A home-run swing. Caps fluttering down after the fight. It calls back to the shop's Propeller Cap ("Does not fly. We checked.").
- **Job.** Cheap air chip that melee-only decks can't touch (Brick, Bruiser, Big Jelly). It distracts the tower, and it defends against a Brick.
- **Counters.** One Arrow Rain kills all three (63 against 60), as do Archers, towers, the Netter, Big Sneeze, the Juggler, and a well-timed club at the bottom of a dive.
- **Art.** Small beans (about 21 px) wearing a **red-and-yellow propeller cap** (`#e94b3c` / `#ffd23f`). Draw the propeller as a fast blurred disc plus two blade strokes. Legs paddle. A soft ground shadow under each flier, sized by altitude, is essential for reading height on a phone; it comes from the existing `drawShadows`.
- **Card art.** Three Pals at three heights over their shadows, one diving.

#### 18. Pogo Bean (`pogoBean`): the fast win condition

```js
pogoBean: { id: 'pogoBean', name: 'Pogo Bean', kind: 'unit', unit: 'pogo', count: 1, mana: 4, rarity: 'rare', arena: 1,
  desc: 'Boings over beans, bonks towers and buildings. Can\'t stop, won\'t stop.' },
```

```js
pogo: {
  id: 'pogo', name: 'Pogo Bean', shape: 'bean', blurb: 'Hops over everything. Bonks towers.', cost: 110,
  hp: 260, radius: 13.5, bodyLen: 24, speed: 110 /* average, for the bot and UI */, mass: 1, poise: 0.8,
  weapon: 'pogo', targets: 'structures',
  body: { thigh: 13, shin: 13, upperArm: 10.5, foreArm: 10.5 },
  hop: { vx: 130, vy: 420, rest: 0.08, wallVy: 330, stickBelow: 26, overAlt: 20, remount: 0.4,
    stomp: { damage: 20, stun: 0.4, bounce: 1.3 }, bonk: { damage: 20, reach: 26 } },
  engage: 14, reach: 26,
  poses: {
    rest: { main: [5, -14], off: [3, -14], ang: 90, lean: 0.05, crouch: 0, wk: 1.2 },   // both hands on the handlebar, stick straight down
    cheer: { main: [4, -14], off: [2, 14], ang: 90, lean: -0.05, crouch: 0, wk: 1.2 } },
},
// WEAPONS (unit-types.js)
pogo: { len: 34, tipMass: 0.5, tipR: 3, grip: 8, react: 0.2 },
```

**Locomotion** (`unit.js`, for `type.hop`):

- **The stick.** The stick is the weapon tip, held straight down (pose `ang: 90`). Its tip is the "foot": it sits `stickBelow` px under the feet. The feet are tucked on the pegs; in `legs()` they spring to `(hip.x ± 3, hip.y + legLen·0.7)`.
- **Support.** The hip support spring targets `ground − (legLen·0.7 + stickBelow)`. `groundF` comes from the stick tip's height above its ground, not from the hip.
- **The hop.** When `groundF > 0.8`, `hopCool ≤ 0`, `conscious > 0.6` and the unit is not down, every part gets `addVel(f·vx, −vy)`. Then `hopCool = rest·(1/tempo)` and it emits `boing {unit}`. That gives an apex of about 75 px, a hop of about 95 px, and about 110 px/s on average.
- **At its target structure** (face distance < `bonk.reach` + 20) it hops in place (`vx = 0`, `vy = wallVy`). At each touchdown within `bonk.reach` of the face it bonks: `damageTower(b, t, bonk.damage·dmgMul·takesOf(t,'melee'), …, 'pogo', u)`. That is about 20 every 0.7 s.
- **Over beans.** `separate()` skips enemy pairs when either unit has `type.hop` and `alt > hop.overAlt`. It only collides with beans while touching down.
- **Stomp.** In `post()`, while falling (tip vy > 0), if the stick tip comes within `e.R + 4` of an enemy head, that enemy takes `stomp.damage` and `stun`, plus a squash kick (`sqv += 8`). The Pogo's vertical speed becomes `−vy·bounce·0.8`, once per hop. Emits `stomp {unit, victim}`.
- **Knocked down.** The usual `downT`: the stick flops around (it is a weapon tip). When it gets up there is `remount` s of "climbing back on" with no hops.
- **Death.** `dropWeapon` makes it a `'pogo'` item with **bounce 0.8** (override in `dropWeapon` for this kind): boing… boing… boing.
- **Targeting.** Structures only. It is a **ground** unit (no `flying`), so melee may target it and the timing decides the hit. Archers and towers hit it normally.
- **Physics beat.** Boing-boing over a whole defensive line, stomping two heads on the way, while a Clubber swings at the air where it was.
- **Job.** A fast win condition and a punisher. Play it at the bridge right after they spend mana. It pairs with cheap cycle cards (Sprouts, Sneeze).
- **Counters.** Any building, which pulls it (the nearest structure) and holds it under tower fire. The Boing Box punches it out of the air. Knockdowns: Cheese Wheel, Boulder, a full-speed club at touchdown. Banana Peels on the landing spot. The Pelican lifts it away. It has only 260 hp, so tower plus Archers works.
- **Art.** A bean on a **silver stick** (`#c9d1d9`) with a black coil spring, a red handlebar and black footpegs. Motion arcs and dust at touchdown.
- **Card art.** Mid-hop at the apex over a tiny Clubber, "BOING" lines.

#### 19. Butterfly Netter (`netter`): anti-air on foot

```js
netter: { id: 'netter', name: 'Butterfly Netter', kind: 'unit', unit: 'netter', count: 1, mana: 3, rarity: 'rare', arena: 1,
  desc: 'Catches flying beans like butterflies, then plants them in the dirt.' },
```

```js
netter: {
  id: 'netter', name: 'Butterfly Netter', shape: 'bean', blurb: 'Nets fliers out of the sky.', cost: 90,
  hp: 230, radius: 13.5, bodyLen: 24, speed: 62, weapon: 'net',
  hitsAir: true, airReach: 130, prefersAir: 280,   // picks any targetable flier within 280 px first
  engage: 42, reach: 54, engageAir: 16, reachAir: 48,
  attack: { windup: 0.3, hold: 0.05, strike: 0.14, recover: 0.4, cooldown: 0.5, damage: 30, knock: 160, stun: 0.3, shieldPierce: 0.45, cleave: false,
    air: { damage: 45, liftOff: 1.8, yank: 300, stun: 0.9, immune: 3 } },
  poses: {
    rest: { main: [4, -6], off: 'shaft', ang: -100, lean: 0.03, crouch: 0, wk: 1 },
    windup: { main: [-3, 18], off: 'shaft', ang: -125, lean: -0.25, crouch: 5, wk: 1.5 },          // ground swat: overhead...
    strike: { main: [16, -2], off: 'shaft', ang: 50, lean: 0.4, crouch: -2, wk: 3.5, hk: 2 },       // ...down onto the bean
    windup2: { main: [-6, -8], off: 'shaft', ang: 40, lean: -0.15, crouch: 6, wk: 1.5 },           // air scoop: low...
    strike2: { main: [10, 20], off: 'shaft', ang: -80, lean: -0.2, crouch: -4, wk: 3.5, hk: 2 },   // ...sweeping up overhead
    recover: { main: [2, 4], off: 'shaft', ang: -70, lean: 0.1, crouch: 2, wk: 1.3 },
    cheer: { main: [4, 18], off: 'shaft', ang: -85, lean: -0.05, crouch: 0, wk: 1 } },
},
// WEAPONS
net: { len: 50, tipMass: 0.45, tipR: 13, grip: 10, react: 0.4 },
```

**Targeting.** Any flier it can target within `prefersAir` comes first (see 3.2 `airReach`). Otherwise it fights like a normal melee bean.

**Against a flier** it walks under it (`engageAir`, `reachAir` measured along x). `startAttack` picks **variant 1** (`windup2`/`strike2`) when its target is a flier, and variant 0 otherwise.

**On a net hit against a flier** (`resolveMelee`: the hoop's swept tip, `tipR` 13, against an `air` or low flier, attacker `hitsAir`):

- `damage 45 · dmgMul`, `stun 0.9`.
- Unless `netImmuneT > 0`: `liftOffT = max(liftOffT, 1.8)`, every part gets `addVel(0, +yank)`, and `netImmuneT = 3`.
- Emits `netted {unit, from}`.
- The flier crashes into the dirt and is a ground target for everyone until its lift comes back.

**Against ground** it is a plain melee hit: 30 damage, knock 160, stun 0.3.

- **Physics beat.** Swoosh, and a Propeller Pal is caught like a butterfly and slammed face-first into the ground. Dust puff, spinning eyes, the prop still whirring in the dirt while two Clubbers run over.
- **Job.** An anti-air specialist that still fights on the ground. It turns fliers into ground targets for your melee.
- **Counters.** Ground melee (Clubbers, Bruiser, Nutcracker); swarms (one target at a time); Archers; Anvil. A Pelican at cruise height is out of its reach; it can only catch one that swoops.
- **Art.** A bean with **round glasses** (render prop) and a long thin brown pole with a **big white mesh hoop** (draw the hoop as a white ring with a faint cross-hatch, alpha 0.6). A caught flier is drawn tangled in the mesh for 0.3 s.
- **Card art.** Net raised high, a tiny Propeller Pal inside it.

### Arena 2: Boom Ridge

#### 20. Big Sneeze (`bigSneeze`): the 2-mana reset

```js
bigSneeze: { id: 'bigSneeze', name: 'Big Sneeze', kind: 'spell', spell: 'bigSneeze', radius: 140, mana: 2, rarity: 'common', arena: 2,
  desc: 'Ah... ah... ACHOO! Blows enemies back, fliers too, and pops their hats.' },
```

```js
bigSneeze: { inhale: 0.4, damage: 20, push: 420, up: 140, falloff: 0.4, stun: 0.3, air: 1.8 },
```

The entity is `{ kind: 'sneeze', team, f, x, y, t, radius, state: 'inhale' | 'blow' | 'fade', done }`. It emits `spellCast` at once.

**Inhale (0.4 s).** Purely visual: a pepper-nose cloud swells and the hats in the circle tilt toward it.

**Blow** (one pass at `t = inhale`). Emits `sneeze {spell, radius}`. Every enemy unit (alive, not gone) with `|e.hip.x − x| ≤ radius + e.R·0.5`, at any height, takes:

```js
takeHit(b, { damage: 20·dmgMul, dvx: f·push·(1 − falloff·d/radius)·(e.type.flying || e.floatT ? air : 1),
  dvy: −up, stun: 0.3, kind: 'sneeze', shove: true, spin: 0.5, x, y })
```

- `f` is the caster's facing, so the shove goes toward the enemy's own side. `takeHit` applies heft, so heavies barely move.
- **Holders let go.** If the enemy is holding something (Pelican, Jelly), it lets go (`letGo(v, f·150, −150)`) and emits `letGo {unit, victim, why: 'sneeze'}`.
- **Hats.** It pops every hat in the circle (`popHat`), not only on hard hits.
- **Structures.** Towers take `20·0.5`, buildings `20·0.75`.
- **Never** a knockdown on its own (stun 0.3).

- **Physics beat.** The whole push leans back as if in a wind tunnel, hats fly off in a line, Propeller Pals spin away like leaves, and a Pelican drops its catch in surprise.
- **Job.** The 2-mana reset: push a crowd out of tower range, push a Pogo or Bomb back, peel fliers off a tower, rescue a held bean, finish Sprouts. Its damage is deliberately tiny: it buys time, it doesn't kill.
- **Counters.** Heavies barely move (Brick heft 0.3, Big Jelly 0.35, Bruiser 0.55). Shields and Squires slide less (heft 0.7). Bubble Wrap soaks the damage. You can just play after it: nothing lingers.
- **Art.** A pale grey-green cloud (`#d8e8c8`) with a big pink cartoon nose (`#f29c9c`), droplets on the blow, wind streaks.
- **Card art.** The cloud and nose mid-ACHOO, two hats tumbling out of frame.

#### 21. Shaken Soda (`shakenSoda`): the delayed geyser

```js
shakenSoda: { id: 'shakenSoda', name: 'Shaken Soda', kind: 'spell', spell: 'shakenSoda', radius: 75, mana: 3, rarity: 'epic', arena: 2,
  desc: 'Shake, shake, shake... POP! Everything on top goes straight up.' },
```

```js
shakenSoda: { fuse: 1.2, damage: 50, lift: 900, side: 80, stun: 0.6, airLiftOff: 0.6, erupt: 0.6 },
```

The entity is `{ kind: 'soda', team, f, x, y, t, radius, state: 'fizz' | 'erupt' | 'fade', shake, done }`.

**Fizz.** The bottle drops cap-up into the ground at x (render: about 0.15 s) and shakes for `fuse` seconds. `shake` goes 0 → 1 for the renderer. This is the warning.

**Erupt** (one pass at `t = fuse`). Emits `sodaErupt {spell, radius}`. Every enemy with `|e.hip.x − x| ≤ radius + e.R·0.5`, at any height, with `k = 1 − |dx|/radius`:

```js
takeHit(b, { damage: 50·dmgMul, dvx: sign(dx)·side·k, dvy: −lift·(0.5 + 0.5k), stun: 0.6, kind: 'soda', spin: 0.6, flip: 90·k })
```

- **Fall damage.** Light beans fly about 300 px up and take the existing fall damage on landing (about 20, plus 0.4 consciousness). Heavies lift little (Brick `heftUp` 0.35), so the physics does the scaling.
- **Fliers** also get `liftOffT = max(·, 0.6)`, so they tumble. A Pelican lets go (its stun rule).
- **Towers** within reach take `50·0.5`.
- It does not light Bombs. The eruption lasts `erupt` s (render only), then the entity fades.

- **Physics beat.** Shake, shake, fizz… WHOOSH: a column of beans shoots straight up like corks, flailing, and rains back down on their friends.
- **Job.** Zone denial and a clump punisher. Cast it ahead of a push so the push walks into it under your tower. It pops Archers, a Juggler or Sprouts out of a push, and it hits air.
- **Counters.** The 1.2 s warning (good players and good bots wait it out). Heavies barely lift. Spread-out pushes take little. Fast units (Pogo, Spikers) are past before it pops.
- **Art.** A **green glass bottle** (`#3fae5a`) with a red label (`#e0352b`) and a silver cap. Fizz bubbles, then a white and pale-brown foam column (`#f4ecd8`) about 300 px tall. The cap flies off (cosmetic).
- **Card art.** The bottle shaking, the cap popping, foam bursting.

#### 22. Bomb Juggler (`bombJuggler`): LEGENDARY

```js
bombJuggler: { id: 'bombJuggler', name: 'Bomb Juggler', kind: 'unit', unit: 'juggler', count: 1, mana: 5, rarity: 'legendary', arena: 2,
  desc: 'Juggles three lit bombs and lobs them at crowds. Do NOT knock it over.' },
```

```js
juggler: {
  id: 'juggler', name: 'Bomb Juggler', shape: 'bean', blurb: 'Lobs bombs at crowds and fliers. Fumbles.', cost: 150,
  hp: 280, radius: 13.5, bodyLen: 24, speed: 55, mass: 1.0, weapon: 'none',
  ranged: true, hitsAir: true, range: [200, 240],          // Archers (230–300) outrange it
  attack: { toss: true, draw: 0.55, recover: 0.45, cooldown: 0.6, maxSpeed: 560, spread: 0.06 },
  bomb: { r: 6, bounce: 0.4, fuse: 0.6, maxAge: 2.5, radius: 65, damage: 60, launch: 380, friendly: 0.2, chain: 0.4, vsGiant: 1.3, vsTower: 0.5 },
  fumble: { onDown: 1, onDeath: 3, every: 4, delay: 0.5, spread: 35 },
  poses: {
    rest: { main: [6, 10], off: [-4, 10], ang: 0, lean: 0, crouch: 0, wk: 1 },       // hands up, juggling
    toss: { main: [-8, 14], off: [6, 8], ang: 0, lean: -0.2, crouch: 2, wk: 1 },      // throwing arm back
    cheer: { main: [6, 16], off: [-6, 16], ang: 0, lean: -0.05, crouch: 0, wk: 1 } },
},
```

**Attack** (`animateToss`, the act phases `'draw'` → `'recover'`, the same timing contract as the bow). `solveAim(u, target)` is reused with `maxSpeed 560`, so the bomb lobs. At the end of the draw it calls `battle.fireBomb(u, sol)`, which pushes a shot:

```js
{ kind: 'jbomb', team, x, y, vx, vy, r: 6, age: 0, bounced: false, fuseT: -1, from: u, dmgMul: u.dmgMul, X: type.bomb, ground: target.ground }
```

**Shots** (`towers.js` `updateShots`, which dispatches on `kind`). A `jbomb`:

- falls with gravity;
- **bursts on contact** with any enemy body (`closestOnBody`, fliers included) or an enemy structure's rectangle;
- otherwise bounces once off the ground (×`bounce`), rolls, and bursts `fuse` s after the first ground touch, or at `maxAge`.

**Burst.** `b.blastAt(x, y, X, team, dmgMul, null, { power: 0.5, small: true })`. Friends get the usual arena treatment (share `friendly`, soft shove). Bombs within half the radius light up (`chain`). Towers take `vsTower`.

**Fumbles** (scheduled with `battle.later`; the bombs are `jbomb` shots with `fuseT = delay`, `vx = ±rng·60`, `vy = −120`, `from: null`):

- **Knockdown, or grabbed by a Pelican or Jelly.** It drops `onDown` bomb at its feet, at most once per `every` s. Emits `fumble {unit, n: 1}`.
- **Death.** It drops `onDeath` bombs within ±`spread` px. Emits `fumble {unit, n: 3}`.
- **Who gets hurt.** With `from: null` its own side takes the friendly share and the Juggler is not excluded: it fumbles on itself.

**Render-only juggling.** Three bombs orbit a figure-eight over its hands (period 0.9 s, `u.time`). One leaves the loop on each toss and a "fresh one" is pulled from its belt. While `act` is down or the unit is dead, nothing orbits. The fumbled bombs are real shots.

- **Physics beat.** The nervous grin while three fizzing bombs loop overhead. Lobbed bombs boing and roll. When a Clubber bonks it, the "uh-oh" face, one bomb on its own toes, BOOM. Kill it inside its own push and the push takes three in the face.
- **Job.** Splash support behind a tank. It shreds swarms (Sprouts, Spikers, Gang) and hits air (Propeller Pals, Pelican).
- **Counters.** Archers outrange it. The Anvil one-shots it (310 against 280). Brollies drop on it, and the Pelican lifts it (it fumbles). Kill it near its own push. Spikers dive it.
- **Art.** A bean in a **jester ruff** (a white zig-zag collar) with a team-colour and white diamond pattern on the body (render overlay, like the Brick's mortar). Three small black bombs (r 6, about 2.5 px each on a phone) with orange sparks, looping over its head. That loop is the silhouette.
- **Card art.** The Juggler mid-juggle, three bombs in a loop, eyes nervous.

### Arena 3: Brick Fortress

#### 23. Boing Box (`boingBox`): the defensive building

```js
boingBox: { id: 'boingBox', name: 'Boing Box', kind: 'building', building: 'boingBox', mana: 3, rarity: 'common', arena: 3,
  desc: 'A lovely present! Walk up and open it. (It\'s a boxing glove. On a spring.)' },
```

```js
// BUILDINGS (sim/buildings.js)
boingBox: { name: 'Boing Box', hp: 320, w: 46, h: 46, life: 25, arm: 1.0,
  punch: { reach: 90, band: 34, windup: 0.2, out: 0.08, hold: 0.06, back: 0.5, recharge: 1.0,
    damage: 40, launch: [380, 300], stun: 0.6, flip: 150, maxHits: 2 } },
```

**State** `t.punch = { phase: 'idle' | 'windup' | 'out' | 'hold' | 'back' | 'recharge', t, ext, dir }`. `ext` (0..1) is the glove's extension, for the renderer.

1. **Idle.** When armed, it looks for an enemy ground unit (not `air`, not held) whose hip is within `reach` px of either face and within `band` of the glove's height. If one is found, it sets `t.f = dir` toward it, starts the windup (the lid rattles, 0.2 s) and emits `punchWindup {tower}`.
2. **Out** (0.08 s). The glove sweeps from the face to `reach`. It hits up to `maxHits` enemies whose body capsule the glove path crosses (sweep test: segment against capsule, glove radius 10), each once. Each hit:

   ```js
   takeHit(b, { damage: 40·dmgMul, dvx: dir·380, dvy: −300, stun: 0.6, kind: 'punch', shove: true, flip: 150, spin: 0.4 })
   ```

   That emits `hit` with kind `'punch'`. Heft scales the launch, so the Brick gets booped on the nose and barely moves. A lit Bomb punched back keeps burning and goes off among its friends.
3. **Back.** Hold, then the glove wobbles back on its spring ("boiyoioing"), then it recharges. A full cycle takes about 1.9 s. Emits `punch {tower, dir}` when the glove goes out.

- **Air.** It ignores air.
- **Who attacks it.** It is a structure, so everything that goes for structures attacks it. Melee beans walk right up to it, and that's the joke.
- **Physics beat.** Beans walk up to inspect a present… BOING, a cartwheel back into their friends like bowling pins. A Pogo punched clean out of the air.
- **Job.** A cheap reset against a single melee unit, a Pogo or Bombs. Bait for the Brick and the Pogo, held under your tower. It combos with Banana Peels: slip, slide into the box, punch.
- **Counters.** Ranged units outrange it (Archers, Juggler). Swarms (one punch per 1.9 s, at most 2 beans). Fliers. Spells (it takes 0.75; the Anvil deletes it). The Brick barely moves. `shoveT` makes back-to-back punches weak.
- **Art.** A **team-colour gift box** with a big white bow on top. The glove is red (`#e0352b`) on a zig-zag silver spring. The lid lifts on the windup. Wilting with age: the bow droops. Footprint 46×46 is about 20 px on a phone, so keep the bow chunky.
- **Card art.** The glove mid-punch, a bean flying out of frame.

#### 24. Bean Patch (`beanPatch`): the spawner

```js
beanPatch: { id: 'beanPatch', name: 'Bean Patch', kind: 'building', building: 'beanPatch', mana: 4, rarity: 'rare', arena: 3,
  desc: 'Plant it and Sprouts pop out of the dirt, shake it off and charge.' },
```

```js
beanPatch: { name: 'Bean Patch', hp: 360, w: 64, h: 40, life: 24, arm: 1.0,
  spawn: { unit: 'sprout', every: 3.4, max: 3, vx: [120, 200], vy: [300, 380], deployT: 0.6 } },
```

**State** `t.spawn = { next, kids: [] }`, where `kids` holds the ids of the live units this patch spawned. `removeUnit` prunes them.

- **Spawning.** First at arming (1.0 s after placement), then every `every` s, only while live kids < `max`. A blocked spawn retries 0.5 s later.
- **The spawn call.** `battle.spawn('sprout', team, t.x + f·w/3, { level: t.level, pop: [f·rng(vx), −rng(vy)], deployT: 0.6, from: t })`. When it executes it sets `u.spawnOf = t.id`, pushes to `t.spawn.kids` and emits `sproutPop {tower, unit}`.
- **Totals.** About 6–7 Sprouts over its life (fewer while capped).
- **No burst on death**, and its Sprouts live on.

- **Physics beat.** Sprouts pop out of the dirt like popcorn, spinning. One lands on its face, one lands on another Sprout, then they shake off the dirt and charge, squeaking. A Boulder on the patch sends the half-grown ones flying with the clods.
- **Job.** A defensive anchor that pulls structure-hunters (Brick, Pogo) and melee pushes. It trickles out cheap bodies that soak spells, Pelican scoops and Jelly engulfs. It is also the patient deck's slow pressure.
- **Counters.** Arrow Rain or Big Sneeze on the Sprouts, the Juggler, Archers outranging the Sprouts, the Anvil or Boulder on the patch, Propeller Pals (Sprouts can't hit air), and a Brick or Bruiser that walks through the Sprouts and flattens it.
- **Art.** A **wooden planter box** (`#8a5a2e`) of dark soil (`#5a3a22`) with three green sprout tufts and a little white sign with a bean doodle. The tufts shake before a pop. It wilts with age: the leaves droop and turn yellow.
- **Card art.** The box with a Sprout popping out, dirt flying.

#### 25. Anvil (`anvil`): the big single hit

```js
anvil: { id: 'anvil', name: 'Anvil', kind: 'spell', spell: 'anvil', radius: 34, mana: 4, rarity: 'rare', arena: 3,
  desc: 'Look up. No, further up. CLANG! Squashes one big bean flat.' },
```

```js
anvil: { fall: 0.9, height: 620, damage: 310, shield: 0.4, stun: 1.2, squash: 1.0, carry: 900, liftOff: 1.2, rest: 2.0 },
```

The entity is `{ kind: 'anvil', team, f, x, y, vy, t, r: 18, state: 'fall' | 'rest', alpha, done }`. It falls straight down at x, timed to land at `t = fall`. The renderer draws a shadow that grows the whole time.

**Impact.** Emits `anvilImpact {spell, power: 1.4, hits}`. Every enemy unit with `|e.hip.x − x| ≤ radius + e.R`, **at any height**, takes:

```js
takeHit(b, { damage: 310·dmgMul·(e.type.shield ? shield : 1), dvx: 0, dvy: e.air ? +carry : 60, stun: 1.2, kind: 'anvil', spin: 0.2 })
```

- **Squash.** Survivors get `squashT = 1.0`: the renderer pancakes them, and they are knocked down anyway.
- **Fliers in the column** also get `liftOffT = 1.2`. They are slammed down with it.
- **Shields.** A Squire always gets its shield up in time (it sees the shadow): only 40% gets through (BONG).
- **Structures.** Towers take `310·0.5`, buildings `310·0.75`.
- **Afterwards.** The anvil rests for 2 s (cosmetic; not solid), then fades.

- **Physics beat.** A whistle, a growing shadow, CLANG. A pancaked bean peels itself off the ground with an accordion squeak. A Propeller Pal or Pelican dragged out of the sky.
- **Job.** The big single-target answer. It kills the Juggler (280), Bruiser (250), Netter, Drummer and Archers. It takes a third off a Brick or Big Jelly, half off a Pelican, deletes a Boing Box, and finishes towers and buildings.
- **Counters.** It is slow and visible (0.9 s), so fast units step out (Pogo, Spikers, charging Clubbers). Swarms make it a terrible trade. Shields. Bubble Wrap soaks 70.
- **Art.** Dark iron (`#4a4f57`, highlight `#8a919b`), the classic silhouette (horn on one side). A dark ellipse shadow that grows. On impact: a dust ring, stars and a big white "CLANG" word.
- **Card art.** The anvil mid-air above a worried bean, with its shadow.

#### 26. Nutcracker (`nutcracker`): the tank-killer

```js
nutcracker: { id: 'nutcracker', name: 'Nutcracker', kind: 'unit', unit: 'nutcracker', count: 1, mana: 4, rarity: 'epic', arena: 3,
  desc: 'One big CRUNCH at a time. Cracks shields, bricks and big beans.' },
```

```js
nutcracker: {
  id: 'nutcracker', name: 'Nutcracker', shape: 'bean', blurb: 'One bite at a time. Big beans hate it.', cost: 140,
  hp: 380, radius: 15.5, bodyLen: 30, speed: 52, mass: 1.3, poise: 0.6, heft: 0.8, heftUp: 0.85,
  weapon: 'none', noHat: true,                    // its tall shako is part of it
  engage: 34, reach: 44,
  attack: { bite: true, windup: 0.55, hold: 0.12, strike: 0.12, recover: 0.5, cooldown: 0.6, damage: 110,
    vsHeavy: 1.6, heavyMass: 2, vsTower: 0.5, shieldPierce: 1, knock: 120, stun: 0.6, biteR: 30, cleave: false },
  poses: {
    rest: { main: [8, -8], off: [-2, -8], ang: 0, lean: 0.02, crouch: 0, wk: 1 },
    windup: { main: [2, -4], off: [-6, -4], ang: 0, lean: -0.2, crouch: 4, wk: 1 },   // jaw drops open (render reads act)
    strike: { main: [12, -6], off: [0, -6], ang: 0, lean: 0.45, crouch: -2, wk: 1 },  // SNAP: lunges head-first
    cheer: { main: [6, 14], off: [-6, 14], ang: 0, lean: -0.05, crouch: 0, wk: 1 } },
},
```

The attack uses the normal windup → hold → strike → recover phases, with no weapon tip.

**The bite** (`battle.resolveBite(u)`). It runs once, on the first strike substep:

- **Jaw point.** `jx = head.x + fwx·(R + 8)`, `jy = head.y + fwy·(R + 8)`.
- **Hit test.** The nearest enemy (not `air`, not held) whose head or chest is within `biteR + e.R` of the jaw point takes `damage·dmgMul·(e.mass ≥ heavyMass ? vsHeavy : 1)`. Shields don't block (`shieldPierce 1`); skip the shield test. The hit has `knock 120`, `stun 0.6`, kind `'bite'`, and a squash kick on the victim (`sqv += 10`). Emits `hit` with kind `'bite'`.
- **Structures.** If no bean is hit and the jaw point is within 20 px of an enemy structure's face: `damageTower(b, t, damage·dmgMul·takesOf(t,'melee', vsTower), …, 'bite', u)`. Towers take ×0.5 ("ow, my teeth"); buildings take full.
- **Lethal bites** spit the victim out spinning: launch `[260, 340]`.
- **The jaw.** The renderer reads `u.act.phase` and `u.act.t` for how open it is: open in windup and hold, a trembling hold, shut on strike.

- **Physics beat.** The victim's head squeezed between the jaws, googly eyes bulging, the hat popping off. A lethal bite spits it out spinning. The jaw chatters while it walks.
- **Job.** The tank- and armour-killer: Brick (about 10 s with tower help), Bruiser, Big Jelly, Shield Wall. It catches a Pogo that lands in front of it.
- **Counters.** Swarms (one slow bite per bean: Sprouts, Spikers, Clubber Gang). Air (Propeller Pals, Pelican). Kiting ranged (Archers, Juggler). Knockdowns that reset its long windup (Cheese Wheel, Boulder, Peels, Boing Box). The Anvil.
- **Art.** A **tall bean (1.2×)** with a **tall black shako** (`#1e1e28`), a gold plate (`#e8c04a`) and a red plume. Its biggest feature is a **big square white jaw and beard** (`#f2efe6`) that hinges open. The coat is team colour with gold buttons. The silhouette is the tall hat plus the square jaw.
- **Card art.** Jaw wide open, a nut (or a tiny Brick) in front.

#### 27. Wrecking Crane (`wreckingCrane`): LEGENDARY building

```js
wreckingCrane: { id: 'wreckingCrane', name: 'Wrecking Crane', kind: 'building', building: 'wreckingCrane', mana: 6, rarity: 'legendary', arena: 3,
  desc: 'A crane with a swinging wrecking ball. Beans that wander close go FAR.' },
```

```js
wreckingCrane: { name: 'Wrecking Crane', hp: 700, w: 36, h: 170, life: 28, arm: 1.0,
  pendulum: { pivotUp: 170, pivotFwd: 34, L: 125, r: 20, sense: 190, pump: 9, maxAng: 1.2, damp: 0.4,
    minHit: 260, damage: 60, vRef: 430, dmgRange: [0.6, 1.25], up: 320, carry: 1.1, stun: 1.0, hitLoss: 0.75 } },
```

**State** `t.ball = { ang, angV, x, y, vx, vy, px, py, hits: Set }`. The pivot is at `(t.x + f·pivotFwd, −pivotUp)`. The ball is at `pivot + L·(sin ang, cos ang)`; when it hangs straight down it is at about y = −45, chest height. It is a **deterministic 1-DOF pendulum** (an angle ODE, not a Verlet rope), stepped at 120 Hz:

```js
const enemyNear = any enemy unit (ground or air, not held) with |hip.x − pivotX| ≤ sense;
const push = enemyNear && Math.abs(ang) < maxAng ? pump * Math.sign(angV || f) : 0;
angV += (-(G / L) * Math.sin(ang) + push) * dt;  angV *= Math.exp(-damp * dt);  ang += angV * dt;
```

At full swing the ball reaches about 430 px/s. Hits are swept: the ball's segment this step is tested against each enemy capsule, radius `r + e.R`.

- **A hit needs** speed `v ≥ minHit`, and an enemy not yet in `hits`. `hits` clears every time `angV` changes sign.
- **Each hit:**

  ```js
  takeHit(b, { damage: damage·dmgMul·clamp(v/vRef, dmgRange), dvx: vx·carry, dvy: vy·carry − up, stun: 1.0, kind: 'crane', shove: true, flip: 160, spin: 0.5 })
  ```

  After it, `angV *= hitLoss`: the ball loses energy into the bean. Emits `hit` with kind `'crane'`.
- **Swing event.** `craneSwing {tower, power}` once per pass through the bottom while `v ≥ minHit`.
- **What it ignores.** Its own team, and structures. The ball itself is not solid.
- **Swinging through the air.** It hits fliers it sweeps through; at big swings it reaches about 110 px up.
- **Destroyed.** The mast topples (render) and the ball drops as an item (`kind: 'craneBall'`, mass 3, bounce 0.2) that rolls.

**The numbers in play.** About one or two victims per pass, then it has to pump back up (about 1–2 s). That is roughly 45–60 damage plus a big launch every couple of seconds on whoever stands at its face. `shoveT` softens repeat hits. Ranged units outside 190 px never wake it up.

- **Physics beat.** The crane creaks, the ball winds up, and beans get golf-swung across the field in huge screaming arcs. The Brick takes the ball on the nose and just keeps hammering the post.
- **Job.** A fortress piece: it wrecks melee pushes and swarms that walk into it, and it pulls everything that hunts structures.
- **Counters.** Ranged units outside its reach (Archers at 230+, the Juggler). Spells (Anvil, Boulder; it takes 0.75). The Brick (heft 0.3 shrugs off the ball, and its hp soaks it). The Nutcracker bites the mast between swings. Sprouts (each one eats a pass's energy). It decays over 28 s.
- **Art.** A **yellow lattice mast** (`#f2b632`) with black-and-yellow hazard stripes at the foot, a short jib toward the enemy, a dark cable and a **dark iron ball** (`#3b3f46`, white highlight, r 20, about 17 px on a phone). Speed lines on the ball when `v ≥ minHit`.
- **Card art.** The ball mid-swing, a bean flying away.

### Arena 4: Wobble Summit

#### 28. Brolly Brigade (`brollyBrigade`): deploy-anywhere

```js
brollyBrigade: { id: 'brollyBrigade', name: 'Brolly Brigade', kind: 'unit', unit: 'brolly', count: 3, spread: [-30, 0, 30], anywhere: true,
  mana: 4, rarity: 'rare', arena: 4, desc: 'Three beans, three umbrellas. They drop in anywhere... eventually.' },
```

```js
brolly: {
  id: 'brolly', name: 'Brolly', shape: 'bean', blurb: 'Floats in under an umbrella. Pokes with it.', cost: 70,
  hp: 140, radius: 14, bodyLen: 25, speed: 60, weapon: 'brolly',
  float: { height: 380, vMax: 140, sway: 18, landStun: 0.6 },
  engage: 40, reach: 50,
  attack: { windup: 0.24, strike: 0.1, recover: 0.32, cooldown: 0.3, damage: 26, knock: 140, stun: 0.3, shieldPierce: 0.45, cleave: false },
  poses: {
    rest: { main: [7, -7], off: [10, 0], ang: -38, lean: 0.03, crouch: 1, wk: 1 },
    float: { main: [2, 26], off: [4, 20], ang: -90, lean: 0, crouch: 0, wk: 1.2 },   // umbrella held straight up overhead
    windup: { main: [-6, -4], off: [10, 0], ang: -8, lean: -0.2, crouch: 3, wk: 1.4 },
    strike: { main: [22, -3], off: [10, 0], ang: 2, lean: 0.24, crouch: -1, wk: 2.6, hk: 2.2 },
    cheer: { main: [4, 17], off: [9, 6], ang: -85, lean: -0.05, crouch: 0, wk: 1 } },
},
// WEAPONS
brolly: { len: 34, tipMass: 0.35, tipR: 4, grip: 0, react: 0.4 },
```

**`battle.floatIn(u)`** (instead of `dropIn`):

- **Start.** Teleport every part up `float.height·rng(0.95, 1.05)` and set velocity 0. Set `floatT = 1`, `dropping = false`, `deployT = 99`. Emits `drop {unit}`.
- **Each substep while `floatT > 0`.** If the hip's downward speed is above `vMax`, every part gets `addVel(0, −(vy − vMax)·0.5)`. Add a sway force on the hip, `±sway·sin(1.7·time)`, and use pose `float`.
- **Landing.** When `groundF > 0.5`, set `floatT = 0` and `deployT = 0.4`, and emit `brollyLand {unit}`. The descent takes about 2.7 s.
- **Flip.** In `takeHit`, **any damaging hit while `floatT > 0`** sets `floatT = 0` and `flipped = true`, and emits `canopyFlip {unit}`. Only air-capable sources can reach a floater anyway: arrows, bolts, cannonballs, blasts and spells. It falls freely and takes normal fall damage. On landing it gets `downT = landStun`; then `deployT = 0.4`.
- **While `floatT > 0`** it counts as **air** (3.2). Towers and Archers shoot it. It can't act (`deployT`).

- **Physics beat.** Three beans drift down swaying. An arrow hits one, the umbrella goes inside out, "aaaAAA", thud. The others land on a Juggler's head.
- **Job.** A second front. Drop it behind their tower onto Archers, a Juggler, a Drummer or a Bean Patch. Finish a tower that is almost down, or make them look away from your main push.
- **Counters.** Towers shoot them all the way down (2.7 s). Arrow Rain or Shaken Soda on the landing spot (they are bunched up and can't dodge). Archers. Big Sneeze blows them off course. Melee waiting underneath. The Pelican catches a fresh lander.
- **Art.** A big umbrella with **8 panels striped in team colour and white**, about 30 px wide on a phone, and a hooked handle. Inside out it is a cup shape with bent spokes. On the ground it is closed and poked like a sword.
- **Card art.** Three umbrellas at three heights with beans dangling under them.

#### 29. Bubble Wrap (`bubbleWrap`): helps your side

```js
bubbleWrap: { id: 'bubbleWrap', name: 'Bubble Wrap', kind: 'spell', spell: 'bubbleWrap', radius: 120, mana: 3, rarity: 'epic', arena: 4,
  desc: 'Wraps your beans in bubble wrap. Every hit just goes pop-pop-pop.' },
```

```js
bubbleWrap: { time: 8, absorb: 70, stunMul: 0.5, bounce: 0.6 },
```

**Cast.** The entity `{ kind: 'wrap', team, x, y, t, radius, done }` is a 0.5 s puff for the renderer. At cast, every **own** unit (alive, not gone, ground or air, including ones still dropping) with `|hip.x − x| ≤ radius + R·0.5` gets:

- `wrapHp = wrapMax = absorb·levelMul(cardLevel)` and `wrapT = 8`;
- `wrap {unit}`, emitted for each one.

Recasting refreshes the wrap; it never stacks.

**In `takeHit`:**

- **Absorb.** If `wrapHp > 0`: `const a = min(wrapHp, damage); wrapHp −= a; damage −= a;`, and it emits `wrapPop {unit, left}` (the renderer throttles it).
- **Stun.** `stun ×= stunMul` while `wrapHp > 0`. Knockback is unchanged: wrapped beans still fly, which is the fun part.

**In `post()`:**

- **Landing.** While the wrap holds, there is no fall damage and the body particles' bounce is 0.6. Restore the original bounce (0.32 alive) when it ends.
- **End.** At `wrapT ≤ 0` or `wrapHp ≤ 0` the wrap ends and emits `wrapEnd {unit, popped}`.

- **Physics beat.** Every hit goes POP-POP-POP with little puffs. A wrapped bean flung by a Boulder bounces three times like a rubber ball and gets straight back up.
- **Job.** Protect a push from splash. It fully absorbs one Arrow Rain (63), most of a Boulder, about 7 tower bolts, a Big Sneeze or a Soda. Cast it on Sprouts, Propeller Pals or a Clubber Gang just before their spell lands.
- **Counters.** Big single hits (the Anvil's 310, a Nutcracker bite). Waiting out the 8 s. The Pelican (a carry ignores it). Displacement: the knockback still lands. It does nothing on defence against one big unit.
- **Art.** A translucent sheet (`#dff4ff`, alpha 0.45) with a grid of round bubbles and white highlights hugging the body. Bubbles vanish as `wrapHp/wrapMax` drops; little white "pop" stars on hits.
- **Card art.** A wrapped bean mid-bounce over a dust puff.

#### 30. Tummy Drummer (`tummyDrummer`): the buff

```js
tummyDrummer: { id: 'tummyDrummer', name: 'Tummy Drummer', kind: 'unit', unit: 'drummer', count: 1, mana: 4, rarity: 'epic', arena: 4,
  desc: 'BOOM-BOOM! Friends nearby march and swing faster to the beat.' },
```

```js
drummer: {
  id: 'drummer', name: 'Tummy Drummer', shape: 'bean', blurb: 'Keeps the beat. Everyone nearby speeds up.', cost: 100,
  hp: 240, radius: 15, bodyLen: 26, speed: 58, mass: 1.0, weapon: 'none',
  follow: { behind: 70, home: 80 },
  beat: { every: 0.5, radius: 150, time: 0.6 },          // the effect (+30%) is BEAT in unit-types.js
  poses: {
    rest: { main: [10, 0], off: [8, 2], ang: 0, lean: 0, crouch: 0, wk: 1 },
    beatA: { main: [12, 8], off: [8, -2], ang: 0, lean: 0.05, crouch: 1, wk: 1 },      // left mallet up
    beatB: { main: [10, -2], off: [10, 8], ang: 0, lean: 0.05, crouch: 1, wk: 1 },     // right mallet up
    cheer: { main: [6, 18], off: [-6, 18], ang: 0, lean: -0.05, crouch: 0, wk: 1 } },
},
export const BEAT = { tempo: 1.3, move: 1.3 };
```

**AI** (`think()`, `type.follow`):

- **Following.** The lead is the own unit (alive, not a follower, not held, ground or air) furthest forward (max `f·hip.x`). The goal is `lead.hip.x − f·behind`.
- **Alone.** With no lead, the goal is its own Guard Tower x − f·`home` (or its Castle's, once the Guard Tower is down).
- **Moving.** It walks toward the goal (dead band 12 px) and **never attacks**. Its `target` stays null, so towers and enemies still treat it as a normal unit.

**Beat** (`battle.step`, before the AI loop, for each live drummer):

- Its own `beatClock` advances by dt. Every `every` s, each friendly unit within `|dx| ≤ radius` (any height, itself included, never buildings) gets `beatT = max(beatT, time)`, and it emits `beat {unit}`.
- The pose alternates `beatA`/`beatB` on each beat.
- Two Drummers don't stack: `tempo()` is a constant 1.3.

- **Physics beat.** Everyone nearby bobs and steps in time, pupils bouncing on the beat. Hits make the drum BONG. When it dies the drum rolls away ringing: a `'drum'` item, a short stick drawn as a disc.
- **Job.** A push amplifier: the Clubber Gang, Bruiser and Brick hit 30% faster, and the Pogo and Sprouts get there sooner. It is the Parade deck's engine. Alone it does nothing.
- **Counters.** Kill it: Pelican, Archers, Brollies, Spikers, the Anvil, the Juggler. Splash on the push. Big Sneeze separates it from the push.
- **Art.** A bean with a **big bass drum on its belly**: a white drumhead (`#f4ead8`), a team-colour shell, a gold rim and zig-zag cord. Two mallets with white heads. Rings pulse out on each beat (render, from `beat`).
- **Card art.** Mid-beat, two "BOOM" rings.

#### 31. Pelican (`pelican`): LEGENDARY flier

```js
pelican: { id: 'pelican', name: 'Pelican', kind: 'unit', unit: 'pelican', count: 1, flying: true, mana: 5, rarity: 'legendary', arena: 4,
  desc: 'Scoops up a bean, flies it home and drops it from way up high.' },
```

```js
pelican: {
  id: 'pelican', name: 'Pelican', shape: 'bird', blurb: 'Scoops beans out of pushes. Mind the beak.', cost: 160,
  hp: 320, radius: 16, bodyLen: 22, speed: 85, mass: 1.6, heft: 0.8, heftUp: 0.9, weapon: 'none', noHat: true,
  body: { thigh: 8, shin: 8, upperArm: 12, foreArm: 12, chestFrac: 0.5 },   // arms are the wings
  flying: { alt: 160, bob: 6 },
  engage: 30, reach: 120,
  scoop: { sight: 320, maxMass: 1.0, swoop: 0.9, swoopAlt: 25, beak: 24, pinch: 20, carryAlt: 220, carryBack: 140,
    carryMax: 2.0, dropDamage: 40, dropStun: 0.4, cooldown: 3.5, letGoDamage: 60, letGoStun: 0.5 },
  dash: { kind: 'dive', windup: 0.4, climb: 20, speed: 420, time: 0.6, recover: 0.7, cooldown: 2.0,     // the peck
    damage: 40, launch: [160, 140], stun: 0.4, vsTower: 0.5 },
  poses: {
    rest: { main: [-6, 4], off: [-6, 4], ang: 0, lean: 1.1, crouch: 0, wk: 1 },     // nearly horizontal, wings back
    flap: { main: [-2, 16], off: [-2, 16], ang: 0, lean: 1.1, crouch: 0, wk: 1 },   // wings up (alternate at 3 Hz)
    windup: { main: [-8, 10], off: [-8, 10], ang: 0, lean: 0.6, crouch: 0, wk: 1 },
    dash: { main: [-10, -2], off: [-10, -2], ang: 0, lean: 1.5, crouch: 0, wk: 1 },
    cheer: { main: [0, 18], off: [0, 18], ang: 0, lean: 0.4, crouch: 0, wk: 1 } },
},
```

**Choosing a target** (at think rate, when the scoop is ready). It scoops the best liftable enemy ground bean (3.6) within `sight` along x, by `score = |dx| − 80·(class ranged or support)`, ties by id. With none and the scoop cooling down, it pecks the nearest ground unit or structure with the dive (`dash`). It never targets air.

**The scoop** (act phases):

1. **`swoop`** (≤ `swoop` s). It flies to `victim.hip.x` with `altWant = swoopAlt`, which puts it **below `AIR_MIN`: melee can hit it**. When the beak point (`head + fw·R`) is within `beak` px of the victim's chest, it grabs: `battle.hold(pelican, victim)`, `pinch` damage, and `scoop {unit, victim}`. A Bomb that gets grabbed is lit (`act = fuse`), and a Juggler fumbles. If there is no grab by the end, it climbs back up (recover).
2. **`carry`.** `altWant = carryAlt`, and it flies `carryBack` px toward **its own side**, for at most `carryMax` s. Then `battle.letGo(victim, f·60, 40)` and `pelicanDrop {unit, victim}`. The victim gets `dropSlam = { damage: dropDamage·dmgMul, stun: dropStun }`, applied in `post()` on its first ground impact > 320, on top of normal fall damage.
3. **Lets go early** (`letGo {unit, victim, why}`) when: hit by Big Sneeze; a hit with stun ≥ `letGoStun` (Soda, net, Anvil); `letGoDamage` taken in total during the carry; or death.

Cooldown `cooldown` s after the drop.

- **Physics beat.** The swoop, a bean dangling by the chest from a huge beak with its legs running in the air, screaming. The drop. The splat. A Bomb in the beak turns it into a sooty, smoking mess that keeps flying, dazed.
- **Job.** An air picker. It pulls support out of pushes (Archers, Juggler, Drummer, Netter), lifts an attacker away and drops it into your tower's fire, and rips a Pogo off its path.
- **Counters.** Archers, towers, Arrow Rain, the Juggler, Big Sneeze (it drops its catch), the Soda, the Anvil. Heavy pushes (nothing to lift: Brick, Bruiser, Nutcracker, Big Jelly). Bombs as bait. Melee bonks during the swoop. The Netter, when it swoops low.
- **Art.** `bird` shape: a plump teardrop body along the hip→head axis, in **team colour with a white belly**, a **huge orange beak pouch** (`#f2a93b`) on the head, and the arms drawn as wings (white-tipped) that flap. Wingspan about 2.5 beans. A clear ground shadow.
- **Card art.** The Pelican with a bean dangling from its beak.

#### 32. Big Jelly (`bigJelly`): LEGENDARY tank

```js
bigJelly: { id: 'bigJelly', name: 'Big Jelly', kind: 'unit', unit: 'jelly', count: 1, mana: 6, rarity: 'legendary', arena: 4,
  desc: 'A huge wobbly jelly that swallows small beans whole, then spits them out.' },
```

```js
jelly: {
  id: 'jelly', name: 'Big Jelly', shape: 'jelly', blurb: 'Swallows beans, spits them out. Wobbles.', cost: 260,
  hp: 900, radius: 28, bodyLen: 34, speed: 36, mass: 3.2, poise: 0.3, heft: 0.35, heftUp: 0.4, weapon: 'none',
  spine: 0.15,                                     // hip–head rod stiffness (default 0.22): a huge wobble
  body: { thigh: 14, shin: 14, upperArm: 9, foreArm: 9, standFrac: 0.9, chestFrac: 0.5 },
  engage: 24, reach: 30,
  engulf: { gap: 20, maxMass: 1.0, hold: 2.2, dps: 30, tick: 0.25, spit: [320, 380], spitStun: 1.0, cooldown: 1.5 },
  bump: { gap: 22, every: 1.2, damage: 30, knock: 300, stun: 0.5, vsStructure: 40 },
  poses: {
    rest: { main: [12, -10], off: [-12, -10], ang: 0, lean: 0, crouch: 0, wk: 1 },
    bump: { main: [16, -12], off: [-8, -12], ang: 0, lean: 0.35, crouch: -3, wk: 1 },
    cheer: { main: [12, 8], off: [-12, 8], ang: 0, lean: -0.05, crouch: 0, wk: 1 } },
},
```

**Targets.** Ground beans, then structures (normal melee targeting; it can't hit air).

**Engulf.** When nothing is held, the cooldown is over, and a liftable enemy (3.6) is within `gap` px of its surface (hip distance < `R + e.R + gap`), it calls `battle.hold(jelly, victim)` with the hold point at the jelly's chest, and emits `engulf {unit, victim}`.

- **Inside.** Every `tick` s the victim takes `dps·tick·dmgMul` (`kind: 'engulf'`, no knock).
- **A Bomb** gets lit inside (`act = fuse`). Its blast hits the Jelly with `vsGiant`.
- **A Juggler** fumbles.
- **Spit.** After `hold` s it spits: `letGo(victim)` then `takeHit(victim, { damage: 0, dvx: f·320, dvy: −380, stun: 1.0, kind: 'spit', shove: true })`, and emits `spit {unit, victim}`.
- **Cooldown** `cooldown` s.

**Bump** (independent timer). Every `every` s (×1/tempo), it bumps the nearest other enemy (not `air`, not held) within `gap` of its surface: `30·dmgMul`, knock 300 away, stun 0.5, kind `'bump'`, pose `bump` for 0.25 s. If there is no bean but a structure face is within `gap`: `damageTower(vsStructure·dmgMul·takesOf(t,'melee'))`.

**Holding.** A held victim sits at the jelly's centre (3.6). The renderer draws it between the jelly's back and front layers.

- **Physics beat.** A bean doing slow-motion swimming inside the jelly, eyes wide. Arrows stuck *inside* it like fruit in a mould. The "PTOO" spit. The whole thing jiggling for a second after every hit (the soft spine and squash).
- **Job.** A control tank at the front of a big push. It soaks tower fire and eats the defenders' support one at a time.
- **Counters.** The Nutcracker (×1.6). Bombs (feed it one: ×1.6 inside). The Anvil. Swarms (it eats one at a time). Air (Propeller Pals, Pelican). Kiting ranged. It is slow (36): punish the other side of the field.
- **Art.** `jelly` shape: a **big translucent dome in team colour** (alpha 0.55) with ridged mould grooves, a white highlight streak and fruit bits inside (a cherry, an orange slice), plus googly eyes on the front. About 2× a bean's width. Tiny stubby feet peek out under it.
- **Card art.** The Jelly with a tiny bean swimming inside.

---

## 5. Changes to existing cards

| Card / type | Change | Why |
| --- | --- | --- |
| `brick` (type) | `targets: 'towers'` → `'structures'` (the nearest enemy Guard Tower, Castle or building) | Buildings become its counter. No effect in matches without buildings |
| `brick` (card) | desc → `'A giant block with a hammer. Ignores beans, marches on towers and buildings.'` | |
| `archer` (type) | `hitsAir: true` | Explicit air rule. No effect without fliers |
| Boulder, Cheese Wheel, quakes | Unchanged; documented as ground-only (Boulder by geometry) | |
| Bomb, Mega Bomb | Unchanged: spherical blasts reach low fliers by distance | |
| Towers | Unchanged: they target fliers and floaters (nearest by x) and never buildings | |

---

## 6. Engine features and interfaces

### 6.1 Phase 0 refactors (behaviour-preserving, gated by golden replays)

| Item | File (owner) | Contract |
| --- | --- | --- |
| Golden replays | `tests/battle-golden.test.js` (W1) | Six scripted matches covering all 14 existing cards: bot vs bot with fixed seeds, and scripted plays. Each is hashed as rounded sums of hips, hp, tower hp, crowns and event-type counts at t = 30, 60 and 120 s. **Recorded before any refactor.** They must stay identical through the whole project, unless a commit re-records them and says why (an intended tuning of an existing number) |
| `blastAt` | `battle.js` (W1) | `blastAt(cx, cy, X, team, dmgMul, from = null, opts = {})` holds the body of today's `explode()` loop. `X = { radius, damage, launch, friendly, chain, vsGiant, vsTower }`. It emits `explode {unit: from, power: opts.power ?? 1, team, radius: X.radius, small: !!opts.small}`. `explode(u)` keeps its "blown to bits" part, then calls `blastAt(u.chest.x, u.chest.y, u.type.blast, u.team, u.dmgMul, u)`. Keep the order of operations so replays stay identical. With `from = null`, nobody is excluded |
| `takesOf` | `towers.js` (W2) | `takesOf(t, kind, override)` (3.3) replaces every `TOWER_TAKES.x` read: in `battle.js` (W1: `resolveDash`, `meleeTower`, `quake`, `blastAt`, `stickInTower`) and in `spells.js` (W2: boulder, rain, wheel) |
| Deferred queue | `battle.js` (W1) | `pending`, `later(fn)`, `spawn(...)`, `MAX_LIVE` (3.7). They run at the end of `step()` |
| Status fields | `unit.js` (W1) | The fields in 3.5, all initialised to 0, null or false **without drawing from `u.rng`**: the constructor's rng draw order must not change. Add `alt`, `air`, `tempo()`, `moveMul()`, `holdPoint()` |
| Item life | `battle.js` (W1) | `reap()` fades an item at `it.life ?? ITEM_FADE_AT`. `dropWeapon` gives bounce 0.8 to `'pogo'` items |
| Hat seat | `battle.js` `popHat` (W1) and `render/hats.js` `SEAT` (W3) | Add `jelly: 0.9` to both (they must agree). Types with `noHat` get no hat in `addUnit` (`u.hat = null`) |

### 6.2 Feature list (who builds what, where)

| # | Feature | Files (owner) | Used by |
| --- | --- | --- | --- |
| F1 | Air layer: `alt`/`air`, lift, `canTarget`, hit filters, `liftOffT`, `crash` | `unit.js`, `battle.js` (W1) | Propeller Pals, Pelican, Netter, Brolly, all anti-air |
| F2 | Dive (`dash.kind: 'dive'`) | `unit.js` `animateDash`, `battle.js` `resolveDash` (W1) | Propeller Pals, Pelican peck |
| F3 | Hop locomotion and stomp | `unit.js`, `battle.js` `separate` (W1) | Pogo Bean |
| F4 | Net air payload and variant choice | `unit.js` `startAttack`, `battle.js` `resolveMelee` (W1) | Netter |
| F5 | Bite | `battle.js` `resolveBite` (W1) | Nutcracker |
| F6 | Toss, `jbomb` shots, fumbles | `unit.js` `animateToss`, `battle.js` `fireBomb` (W1); `towers.js` `updateShots` (W2) | Bomb Juggler |
| F7 | Hold, scoop and engulf | `battle.js` `hold`/`letGo`, `unit.js` act phases (W1) | Pelican, Big Jelly |
| F8 | Follower and beat aura | `unit.js` `think`, `battle.js` `step` (W1) | Tummy Drummer |
| F9 | `floatIn` and flip | `battle.js`, `unit.js` (W1) | Brolly Brigade |
| F10 | Statuses: shove, wrap, slip, squash, `dropSlam` | `unit.js` `takeHit`/`post`/`slip` (W1) | Sneeze, Box, Crane, Jelly, Wrap, Peels, Anvil, Pelican |
| F11 | Buildings: `Tower` kind, `BUILDINGS`, update, fit, decay, destroy branch | `sim/buildings.js` (new), `towers.js` (W2); `battle.addBuilding` and targeting hooks (W1) | Boing Box, Bean Patch, Wrecking Crane, Brick, Pogo |
| F12 | New spells: peels, sneeze, soda, anvil, wrap | `spells.js` (W2) | 5 spells |
| F13 | Match rules: building play, anywhere play, formation, weakest, cap | `match.js` (W2) | buildings, Brollies |
| F14 | Legendary rarity and meta | `cards.js` (W2), `meta/*` (W5) | all |
| F15 | Bot | `bot.js` (W5) | all |
| F16 | Render | `render/*` (W3, W4) | all |
| F17 | Wiring: events → fx and sound, aim ghosts, lerp | `main.js`, `audio.js`, `input.js` (W6) | all |

### 6.3 Interfaces by file

**`sim/unit-types.js` (W1)**

New exports: `AIR_MIN`, `BEAT`, and `WEAPONS.pogo`, `.net` and `.brolly`.

New unit fields:

| Field | Meaning |
| --- | --- |
| `flying` | `{ alt, bob }` |
| `hitsAir` | can target and hit high air |
| `airReach` | the highest hip (px above ground) of an air target it can hit |
| `prefersAir` | picks a targetable flier within this many px first |
| `engageAir`, `reachAir` | engage and reach distances against fliers |
| `targets` | `'structures'` for structures-only units |
| `noHat` | wears no cosmetic hat |
| `hop` | Pogo locomotion |
| `bomb`, `fumble` | Juggler |
| `attack.bite`, `attack.toss`, `attack.air`, `attack.vsTower` | attack variants |
| `dash.kind`, `dash.climb`, `dash.vsTower` | dive |
| `float` | Brolly descent |
| `follow`, `beat` | Drummer |
| `scoop` | Pelican |
| `engulf`, `bump` | Big Jelly |
| `spine` | hip–head rod stiffness |

`UNIT_ORDER` appends `'sprout', 'copter', 'pogo', 'netter', 'juggler', 'nutcracker', 'brolly', 'drummer', 'pelican', 'jelly'`. The new shapes are `'bird'` and `'jelly'`.

**`sim/unit.js` (W1).** Fields from 3.5. Getters `alt` and `air`. Methods `tempo()`, `moveMul()`, `holdPoint()`, `slip(b, peel)`. Act phases are `'windup' | 'strike' | 'recover' | 'dash' | 'draw' | 'fuse'` plus the new `'toss' | 'swoop' | 'carry'`. The renderer may read `act.phase` and `act.t`.

**`sim/battle.js` (W1)**

New methods:

```js
addBuilding(bid, team, x, level)    // -> Tower; calls makeBuilding(...) from sim/buildings.js, pushes to towers, emits buildingPlaced
floatIn(u)                          // Brolly descent (addUnit opts.float)
spawn(typeId, team, x, opts) / later(fn) / pending
hold(holder, v) / letGo(v, dvx, dvy)
blastAt(cx, cy, X, team, dmgMul, from, opts)
fireBomb(u, sol)                    // pushes a jbomb shot
resolveBite(u)
canTarget(u, e)                     // exported for the bot as well
```

Changes to existing methods:

- `findArenaTarget`: `canTarget`, `targets: 'structures'`, `prefersAir`, and the nearest structure including buildings.
- `towerBetween` counts buildings.
- `separate`: skips held units and hopping Pogos.
- `resolveMelee` and `resolveDash`: air filters, the net payload, `vsTower`.
- `step`: the beat pass, the hold springs, and the pending queue at the end.

**`sim/buildings.js` (new, W2)**

```js
export const BUILDINGS = { boingBox, beanPatch, wreckingCrane };      // section 4
export const BUILDING_TAKES, MAX_BUILDINGS = 3, BUILD_SNAP = 80, BUILD_GAP = 12;
export function makeBuilding(bid, team, x, level, id) -> Tower        // new Tower('building', team, x, level, id) + def/state
export function updateBuilding(b, t, dt)                              // landT, decay, arm, punch / spawn / pendulum
export function fitBuilding(b, team, bid, x) -> number | null
```

**`sim/towers.js` (W2)**

- The `Tower` constructor gets a `kind === 'building'` branch. A building has these fields:

  ```js
  { kind: 'building', bid, def, building: true, isTower: true, x, w, h, f, team, hp, maxHp, alive, active: true,
    level, dmgMul, range: 0, age, landT, hitT, downT, shotT, aim, arrows, takes: BUILDING_TAKES,
    punch? / spawn? / ball? }
  ```

- `takesOf`.
- `damageTower`: no wake for buildings.
- `destroyTower`: the building branch, which emits `buildingDown`.
- `updateTowers`: buildings call `updateBuilding` and skip shooting.
- `updateShots` dispatches `'cannon' | 'jbomb'`.
- `muzzle()` is never called for buildings.

**`sim/spells.js` (W2).** New `SPELLS` entries (section 4). `KIND` gains `bananaPeels → 'peels'`, `bigSneeze → 'sneeze'`, `shakenSoda → 'soda'`, `anvil → 'anvil'` and `bubbleWrap → 'wrap'`. There are `castSpell` branches and an `updateSpells` tick for each, plus `updatePeels(b, dt)`.

**Moving entities** expose `x, y, vx, vy` so `main.js` can interpolate them. These are falling anvils, `jbomb` shots and the Crane's `t.ball`.

**`sim/match.js` (W2)**

- `canPlay`: the building rule (`WORLD.deploy`, `fitBuilding`) and the anywhere rule.
- `play` for buildings: `battle.addBuilding`, and the oldest crumbles above `MAX_BUILDINGS`.
- `formation` for buildings and anywhere cards.
- `weakest` skips buildings.
- New `buildZone(team)`, which returns `WORLD.deploy[team]`.
- `deploy`: `float: true` for `anywhere` cards.

### 6.4 Events (one `battle.emit` stream; existing events unchanged)

Payloads are on top of `{type, x, y}`. "Throttle" means the renderer or audio limits how often it reacts; the sim always emits.

| Event | Payload | Emitted by | When |
| --- | --- | --- | --- |
| `buildingPlaced` | `{tower, team, bid}` | battle.addBuilding | card played (crate starts falling) |
| `buildingLand` | `{tower, power}` | buildings.js | 0.35 s after placing |
| `towerHit` (existing) | `{tower, damage, kind, from, power}` | damageTower | also for buildings: check `tower.kind` |
| `buildingDown` | `{tower, team, bid, cause: 'destroyed' \| 'decayed' \| 'crumbled'}` | destroyTower | instead of `towerDown` |
| `punchWindup` | `{tower}` | buildings.js | the lid rattles |
| `punch` | `{tower, dir}` | buildings.js | the glove goes out |
| `sproutPop` | `{tower, unit}` | battle.spawn (`from` a patch) | a Sprout pops |
| `craneSwing` | `{tower, power}` | buildings.js | a fast pass through the bottom |
| `hit` (existing) | `{kind, power, dirX, dirY, unit, from, killed}` | many | new kinds: `'dive'`, `'peck'`, `'bite'`, `'punch'`, `'crane'`, `'bump'`, `'stomp'`, `'net'` |
| `liftOff` | `{unit, from}` | net, anvil, soda | a flier's lift switches off |
| `netted` | `{unit, from}` | resolveMelee | net catch |
| `crash` | `{unit, power}` | unit.post | a dead or lift-less flier hits the ground |
| `propOff` | `{unit}` | unit.die | a copter's cap pops |
| `dive` | `{unit}` | animateDash (dive) | the dive starts |
| `boing` | `{unit}` | Pogo | each hop |
| `stomp` | `{unit, victim}` | Pogo | a head stomp |
| `juggleToss` | `{unit}` | fireBomb | a throw |
| `fumble` | `{unit, n}` | Juggler | knockdown, grab or death |
| `explode` (existing) | `{unit, power, team, radius, small}` | blastAt | `small: true` for Juggler bombs (no hitstop and no "BOOM!" word in `main.js`) |
| `beat` | `{unit}` | battle.step | every 0.5 s per Drummer |
| `swoop` | `{unit, victim}` | Pelican | the swoop starts |
| `scoop` | `{unit, victim}` | Pelican | the grab |
| `pelicanDrop` | `{unit, victim}` | Pelican | the release at the end of a carry |
| `letGo` | `{unit, victim, why: 'sneeze' \| 'stun' \| 'damage' \| 'death'}` | holders | an early release |
| `engulf` | `{unit, victim}` | Jelly | engulf |
| `spit` | `{unit, victim}` | Jelly | spit |
| `canopyFlip` | `{unit}` | takeHit | a Brolly's umbrella flips |
| `brollyLand` | `{unit}` | unit.post | a floater lands |
| `wrap` | `{unit}` | spells.js | wrapped at cast |
| `wrapPop` | `{unit, left}` | takeHit | the wrap absorbs a hit (throttle) |
| `wrapEnd` | `{unit, popped}` | unit.post | the wrap ends |
| `slip` | `{unit}` | unit.slip | a peel slip |
| `skid` | `{unit}` | unit.slip | a heavy skids |
| `peelKick` | `{}` | spells.js | a used peel flies |
| `sneeze` | `{spell, radius}` | spells.js | ACHOO |
| `sodaErupt` | `{spell, radius}` | spells.js | the geyser |
| `anvilImpact` | `{spell, power, hits}` | spells.js | CLANG |
| `spellCast` (existing) | `{team, spell, card, entity}` | castSpell | every new spell, with its kind |

### 6.5 Determinism and performance

**Determinism**

- Every new gameplay random number comes from `battle.rng` (spawns, peel spread and lanes, jbomb fumble scatter) or `u.rng` (per-unit choices).
- Cosmetic items (prop caps, the drum, the crane ball, extra hats) and pure visuals use `battle.fxRng` or the renderer.
- Feathers, foam, sparks and rings are **render effects, never sim items**.
- No `Math.random`, no `Date.now`, no `Map` or `Set` iteration whose order can depend on anything other than insertion. The Crane's `hits` Set is used only for lookups.

**Performance budget.** Matches must stay at about ~2 CPU-s per simulated minute in busy fights.

- **Fliers are cheaper than walkers:** no foot planting, no step events.
- **The new loops stay small.** Peels, sneeze, soda, anvil, wrap, beat, pendulum, punch and spawner checks are each O(units) per active entity per step, or less often. Drummer beats run every 0.5 s.
- **Juggler bombs** are capped at 3 in flight per Juggler. They use `closestOnBody` within ±60 px, like cannonballs.
- **Holding** is one spring per held unit.
- **Worst-case scenarios** in `battle/tools/balance-arena.mjs --only perf` (W6):
  - two Bean Patches per side, plus Sprouts, plus a Clubber Gang;
  - Big Jelly, Drummer, Juggler and Bomb Squad against a Wrecking Crane and Peels;
  - two Propeller Pals per side, plus a Pelican, Brollies and Sneezes.
- **Targets.** About 2.2 CPU-s per simulated minute on average, and about 3.0 for the worst minute. If over, lower `MAX_LIVE` to 28 and the Patch `max` to 2.

---

## 7. Legendary rarity and the meta game (W5, plus W2 for `cards.js`)

**`sim/cards.js`**

```js
legendary: { id: 'legendary', name: 'Legendary', color: '#2fd3c4', dark: '#147a72', glow: '#c8fff8' },
```

Teal, never confused with rare's orange. Card frame: a slow diagonal rainbow sheen (`render/cards.js`, static in cached faces, a 2 s sweep on the deck screen).

**`meta/collection.js`** (index L−1 is the cost of L → L+1):

```js
UPGRADE_COPIES.legendary = [1, 1, 1, 2, 3, 5, 8, 12];
UPGRADE_GOLD.legendary   = [100, 300, 800, 2000, 4000, 8000, 15000, 25000];
```

King XP is unchanged. Matchmaking already mirrors your deck's levels card by card, so a low-level legendary is never a pay-to-win gap.

**`meta/chests.js`**

- **Big Chest.** It gets `legendary: 0.05`. The roll happens **only when at least one legendary is unlocked** (from Boom Ridge, arena 2, the Bomb Juggler), and it is drawn **right after `epicFlag`**. Below arena 2 no extra rng draw happens.
- **What it gives.** On a hit, the *last common stack* becomes **1 copy of one legendary**. If no common stack is left, the last non-epic stack does. A chest never holds more than 1 legendary copy.
- **Small Chest.** `legendary: 0`.
- **Fallback.** `DOWN.legendary = 'epic'` is used only if the pool is somehow empty.
- **Odds shown.** `chestOdds()` includes `odds.legendary` (5% or 0) and `pool.legendary`. The info popup shows them, e.g. "Legendary: 5% (Big Chest only)".

**`meta/shop.js`.** It gets `price.legendary = 1500` and `count.legendary = [1, 1]`. Once a legendary is unlocked, the third offer becomes a legendary on 8% of days. Draw that extra `rng.chance(0.08)` **only when `pool.legendary.length > 0`**, after the existing draws, so today's shop doesn't change for players in arenas 0–1. `DOWN.legendary = 'epic'`.

**`meta/ladder.js` Trophy Trail.** New milestones are inserted without changing any existing `at` value. A player who already passed one can claim it at once. Each gives enough copies to reach about level 4 right away: commons 20, rares 12, epics 8, legendaries 4.

| at | reward | at | reward |
| ---: | --- | ---: | --- |
| 25 | `{ cards: { sprouts: 20 } }` | 1020 | `{ cards: { boingBox: 20 } }` |
| 120 | `{ cards: { bananaPeels: 20 } }` | 1050 | `{ cards: { beanPatch: 12 } }` |
| 395 | `{ cards: { propellerPals: 20 } }` | 1110 | `{ cards: { anvil: 12 } }` |
| 445 | `{ cards: { pogoBean: 12 } }` | 1200 | `{ cards: { nutcracker: 8 } }` |
| 495 | `{ cards: { netter: 12 } }` | 1280 | `{ cards: { wreckingCrane: 4 } }` |
| 760 | `{ cards: { bigSneeze: 20 } }` | 1520 | `{ cards: { brollyBrigade: 12 } }` |
| 830 | `{ cards: { shakenSoda: 8 } }` | 1575 | `{ cards: { bubbleWrap: 8 } }` |
| 890 | `{ cards: { bombJuggler: 4 } }` | 1625 | `{ cards: { tummyDrummer: 8 } }` |
| | | 1650 | `{ cards: { pelican: 4 } }` |
| | | 1700 | `{ cards: { bigJelly: 4 } }` |
| | | 1750 | `{ gold: 1500, beans: 200 }` (the new end of the Trail) |

The existing test ("every card of arena > 0 is on the Trail") is extended to arena 0 cards that aren't in `STARTER_DECK`.

**`meta/opponents.js` ARCHETYPES** (new; existing ones unchanged). These rules apply:

- Cards that aren't unlocked are skipped and topped up as today.
- An archetype whose first card isn't unlocked at the arena is not picked.
- **Every archetype must hold at least one air answer** among `archers, arrowRain, netter, bombJuggler, bigSneeze, shakenSoda, anvil` at every arena where any flier is unlocked (tested).

| id | name | arena it suits | cards (in order of preference) |
| --- | --- | --- | --- |
| `hop` | Hop Cycle | 1+ | pogoBean, sprouts, bananaPeels, spikers, bomb, netter, archers, arrowRain |
| `fizz` | Fizz Pop | 2+ | bombJuggler, shakenSoda, bigSneeze, megaBomb, squire, propellerPals, sprouts, archers |
| `fortress` | Fortress | 3+ | wreckingCrane, beanPatch, boingBox, brick, anvil, archers, bananaPeels, arrowRain |
| `sky` | Sky Circus | 4 | pelican, propellerPals, brollyBrigade, netter, bombJuggler, bigSneeze, squire, arrowRain |
| `parade` | Jelly Parade | 4 | bigJelly, tummyDrummer, bubbleWrap, clubberGang, bombJuggler, archers, sprouts, boulder |

**Hats (wardrobe).**

- `profile.js` `UNIT_IDS` appends `'pogo', 'netter', 'juggler', 'brolly', 'drummer', 'jelly'`. Missing keys clean to `'none'`, so no migration is needed.
- The `noHat` types are `sprout` (leaves), `copter` (propeller cap), `nutcracker` (shako) and `pelican`. They are not in `UNIT_IDS`, the wardrobe skips them, and `addUnit` never gives them a hat.
- Hat seats: `jelly: 0.9` (see 6.1). The Brolly's hat sits on its head under the umbrella. The Pogo, Netter, Juggler and Drummer use the normal bean seat.

**UI** (`ui/hub-kit.js`, `ui/cards-screen.js`):

- **`cardKindLine`:** `'Building · lasts 25 s'` (from `BUILDINGS[card.building].life`), `'Unit card · flies'`, `'Unit card · lands anywhere'`, and spells as today.
- **`cardStats` rows:** Lifetime and Spawns (buildings); "Targets": `'Air & ground'` (`hitsAir`), `'Ground'`, `'Buildings & towers'` (`targets: 'structures'`), `'Nothing (buffs friends)'` (the Drummer).
- **Card badges:** a small wing (flying), a brick (building) and a target (anywhere), drawn by `render/cards.js`.
- **Deck editor:** a hint, "No air answer in this deck", when the deck holds none of the air answers listed above and a flier is unlocked.
- **Locked cards** show their arena, as today.

**Badges (optional, W5 + W6 counters):** "Slip 'n' Slide" (enemies slipped on peels: 25), "Home Run" (fliers netted or batted down: 10), "Air Mail" (Pelican drops: 20), "Jelly Belly" (Big Jelly spits: 20), "Crane Game" (Wrecking Crane launches: 30). Pay Jellybeans like the existing badges.

---

## 8. Bot (`sim/bot.js`, W5)

**Classes.** `CLASSES` becomes `['siege', 'tank', 'armored', 'melee', 'swarm', 'ranged', 'bomb', 'air']`. Add `DANGER.air = 1.2`.

| Unit type | Class |
| --- | --- |
| `sprout` | swarm |
| `copter` | air |
| `pogo` | siege |
| `netter` | melee |
| `juggler` | ranged |
| `nutcracker` | melee |
| `brolly` | melee |
| `drummer` | ranged (squishy back line) |
| `pelican` | air |
| `jelly` | tank |

**Existing COUNTER rows** gain an 8th (air) value:

| Card | Air value |
| --- | --- |
| archers | 0.9 |
| bombSquad | 0.1 |
| megaBomb | 0.3 |
| all others | 0 |

**The bot never answers fliers with a card whose air value is 0.**

**New COUNTER rows** `[siege, tank, armored, melee, swarm, ranged, bomb, air]`:

```js
sprouts:       [0.6, 0.3, 0.2, 0.3, 0.3, 0.5, 0.5, 0],
propellerPals: [0.8, 0.6, 0.4, 0.6, 0.3, 0.5, 0.6, 0],
pogoBean:      [0, 0, 0, 0, 0, 0, 0, 0],
netter:        [0.5, 0.3, 0.4, 0.5, 0.3, 0.6, 0.3, 1.0],
bombJuggler:   [0.6, 0.6, 0.4, 0.8, 1.0, 0.6, 0.6, 0.8],
nutcracker:    [1.0, 1.0, 0.9, 0.6, 0.2, 0.5, 0.4, 0],
brollyBrigade: [0.4, 0.3, 0.3, 0.5, 0.4, 0.8, 0.3, 0],
tummyDrummer:  [0, 0, 0, 0, 0, 0, 0, 0],
pelican:       [0.3, 0, 0.4, 0.7, 0.4, 0.9, 0.6, 0],
bigJelly:      [0.6, 0.5, 0.6, 0.8, 0.8, 0.6, 0.5, 0],
boingBox:      [0.9, 0.4, 0.5, 0.8, 0.4, 0.2, 0.8, 0],
beanPatch:     [0.9, 0.5, 0.3, 0.5, 0.4, 0.3, 0.4, 0],
wreckingCrane: [0.9, 0.7, 0.8, 1.0, 0.9, 0.2, 0.7, 0.4],
```

**TANK** gains `bigJelly: 0.9` and `nutcracker: 0.3`. Add a new **`RUSH`** table, `{ pogoBean: 1 }`. Rush cards are used by step 5 (punish) and late pushes at the bridge, and never as support.

**View.** `view()` puts buildings in `V.buildings = { mine, theirs }` and keeps them out of `towers`. Threats and pushes count units only. Enemy buildings in our half don't exist (their zone is their own half).

**Placement** (`DEFEND_AT` and the new play rules):

| Card | Where / when |
| --- | --- |
| netter | `'under'`: at the lead flier's p (or the attackers' lead) |
| bombJuggler | `'back'`, like archers; as support `push.front − 120` |
| boingBox | `'front'`: `frontP + 40` (in front of our tower, inside its range) when the threat holds melee, siege or bombs |
| beanPatch | `'front'`: `frontP + 60` against a siege or tank threat; or proactively at ≥ 8 mana with no threat (`frontP + 100`) |
| wreckingCrane | `'front'`: `frontP + 70` when `threat.tv ≥ 5` and the threat is mostly melee, swarm or tank |
| tummyDrummer | support only: `push.front − 90`, when push value ≥ 4 |
| pelican | defence against ranged or melee: played at `frontP − 60` (it flies to its targets); support: `push.front − 150` |
| bigJelly | tank: from the back (`backAt`) or at the bridge in double mana |
| brollyBrigade | `anywhereAt(V)`, see below |
| propellerPals | defence against a melee-only threat (fit from COUNTER); support behind a push |
| sprouts | cheap leak and bait: `pickCheap` favours them; defence in front of a Bomb or Bruiser |
| pogoBean | rush at the bridge when the foe has ≤ 3 counted mana and **no enemy building stands**, or as a late push |

**`anywhereAt(V)`** (Brolly Brigade): score each enemy target, highest first.

1. An enemy tower at ≤ 25% hp: land 50 px in front of its face.
2. The most valuable enemy `ranged` or `support` unit (archer, juggler, drummer, netter) at least 200 px from enemy melee: land on it.
3. An enemy building: land on its near side.

Otherwise it doesn't play the card. It applies the normal placement noise ×0.7.

**Spells** (`spellDamage`, `spellDelay`, `bestSpellSpot`, `finishable`):

| Spell | Damage per bean (before level) | Delay | How it is valued and aimed |
| --- | --- | --- | --- |
| bananaPeels | 8 (stall) | 0.4 | **Defence only.** Value = 0.35 mana per non-heavy enemy ground bean expected to cross the circle inside our tower range. Cast at `threat.lead − vp·0.6` (in front of them). Never on our side of the bridge without a threat |
| bigSneeze | 20 | 0.4 | Value = 0.6 × worth of enemies in radius within 220 px of our front tower (air ×1), + kill value, + 2 if it frees one of our held beans. Also used to rescue a held friend at once |
| shakenSoda | 70 (50 + fall) | 1.2 | Cluster value with heavies at ×0.3; aim `lead + vp·1.2`, so it is cast ahead of a push |
| anvil | 310 | 0.9 | The best **single** target in radius (worth × kill fraction). Enemy buildings count as `card mana × hp fraction`. Finisher: `310 × 0.5 × lvl` |
| bubbleWrap | – | – | **Own push.** Cast during step 4 (support) when our push value ≥ 5 is within 260 px of enemies or inside their tower range and at least 3 of our units fit the circle. At most once per push (10 s) |

**Fliers in threats.** `threat()` counts fliers. `pickDefence` scores only cards with an air value > 0 against the `air` share. With no answer in hand it saves up (skill > 0.35), as for any missing counter.

**Random decks in the balance tool** (W6) must include at least one air answer (the same list), so balance numbers aren't skewed by decks that can't play the air game.

---

## 9. Build plan: workstreams and strict file ownership

Six workstreams. **Only the owner edits a file.** Other streams read it, and request changes through the owner. Test files belong to the stream named here.

| Stream | Owns (edits only these) | Builds |
| --- | --- | --- |
| **W1 sim-units** | `battle/src/sim/unit-types.js`, `unit.js`, `battle.js`, `physics.js`; `tests/battle-golden.test.js`, `tests/battle-units2.test.js`, `tests/battle-sim.test.js`, `tests/battle-physics.test.js` | Phase 0 refactors (6.1); F1–F10; the targeting and wall hooks for buildings; `addBuilding`, `floatIn`, `spawn`, `hold` |
| **W2 sim-world** | `battle/src/sim/cards.js`, `sim/buildings.js` (new), `towers.js`, `spells.js`, `match.js`; `tests/battle-structures.test.js`, `tests/battle-spells2.test.js`, `tests/battle-cards.test.js`, `tests/battle-arena.test.js` | The card contract (all 18 entries, RARITIES, CARD_ORDER) **first**; `takesOf`; F11–F13; `jbomb` shots in `updateShots` |
| **W3 render-units** | `battle/src/render/units.js`, `render/cards.js`, `render/hats.js`; `tests/battle-render.test.js`, `tests/battle-render-units2.test.js` | Shapes `bird` and `jelly`; props (leaves, prop cap and blur, pogo stick, glasses and net, ruff and orbiting bombs, shako and jaw, umbrella open, closed and flipped, drum and mallets, beak and wings); wrap overlay, squash pancake, held victim inside the jelly or dangling from the beak; new item kinds (`peel`, `propCap`, `pogo`, `net`, `brolly`, `drum`, `craneBall`); card faces for the 18 (fliers posed hovering, buildings via `drawBuildingArt`, spells via W4's exports), the legendary frame and the badges |
| **W4 render-world** | `battle/src/render/spells.js`, `render/towers.js`, `render/buildings.js` (new), `render/effects.js` | Buildings (box and glove, patch, crane and ball, crate drop, wilting with age, life clock on the HP bar, collapse into planks); `towers.js` dispatches `kind === 'building'`; spells (peel toss, sneeze cloud, soda bottle and geyser, anvil and growing shadow, wrap puff); `jbomb` shots; aim helpers (building footprint ghost, anywhere markers); new fx kinds for the events in 6.4. Exports for W3: `drawBuildingArt(ctx, bid, x, y, s, team)`, `drawPeel`, `drawSneezeCloud`, `drawSodaBottle`, `drawAnvilShape`, `drawWrapBubbles` |
| **W5 meta-bot-ui** | `battle/src/meta/*.js`, `sim/bot.js`, `battle/src/ui/*.js`, `battle/hub.css`; `tests/battle-meta.test.js`, `tests/battle-meta2.test.js`, `tests/battle-bot.test.js`, `tests/battle-bot2.test.js` | Section 7 (rarity tables, chests, shop, Trail, archetypes, hats list, badges, UI lines and hints); section 8 (bot) |
| **W6 integrate** | `battle/src/main.js`, `audio.js`, `input.js`, `config.js` (only if needed), `battle/sw.js`, `battle/index.html`, `battle/style.css`, `README.md`, `battle/tools/balance-arena.mjs`; `tests/battle-pwa.test.js`, `tests/battle-perf.test.js` | Events → fx, sounds, words and hitstop (`small` blasts: none); interpolation of new moving entities; aim modes (building ghost and anywhere); new sounds (boing, slip, achoo, fizz and whoosh, clang, crunch, drum, whirr, squawk, bloop and "ptoo", bubble pops, creak, glove spring, sprout pop, umbrella flap); `sw.js` PRECACHE for `sim/buildings.js` and `render/buildings.js` plus a VERSION bump; balance tool (`BUILDINGS` root for `--set`, new DECKS, air-answer rule for random decks, `--only perf`, card table for 32); README |

**Order**

1. **Phase 0** (blocking, about 1 day, W1 and W2 pairing, in this order):
   1. W1 records the golden replays on the current code.
   2. W2 lands the `cards.js` contract (RARITIES.legendary, all 18 entries exactly as in section 4, CARD_ORDER, the Brick desc), `sim/buildings.js` with `BUILDINGS`, `BUILDING_TAKES`, `MAX_BUILDINGS` and stub functions, `takesOf` in `towers.js`, and the `SPELLS` constants and `KIND` entries (casts may be stubs).
   3. W1 lands all 10 unit types (data), the status fields and getters, `blastAt`, `later`/`spawn`, the `takesOf` call sites, item `life`, `archer.hitsAir`, `brick.targets = 'structures'` and the `noHat` handling.
   4. **Gate:** golden replays identical and every existing test green.
2. **Phase 1** (parallel):
   - W1 builds F1–F10, roughly in this order: statuses → air and dive → net → bite → toss → hold, scoop and engulf → follower and beat → float → hop.
   - W2 builds the buildings (Box → Patch → Crane), the spells (Peels → Sneeze → Anvil → Soda → Wrap) and the match rules.
   - W3 and W4 draw from the field contract with hand-made fake states in their tests; they don't wait for the sim.
   - W5 does all of section 7 at once (it needs only ids and rarities), and the bot once W1 and W2 land each kind.
3. **Phase 2** (integration): W6 wires the events and sounds, aim and sw; W5 finishes the bot; first balance runs (`--n 24`).
4. **Phase 3** (balance): only numbers change, through `--set` first and then committed by each file's owner. Re-record golden replays only when an *existing* card's number changes on purpose.

**Shared contract points.** Changing any of these needs this document updated and every consumer told.

- The card fields: `kind: 'building'` + `building`, `flying`, `anywhere`.
- The unit fields (3.5, 6.3) and the getters `alt`, `air`, `tempo()`, `holdPoint()`.
- The building fields (6.3: `kind`, `bid`, `def`, `age`, `landT`, `punch.ext`, `spawn.kids`, `ball.{x, y, vx, vy}`).
- The spell entity fields (section 4); item kinds; shot `kind: 'jbomb'`.
- The events (6.4).
- `takesOf`, `blastAt`, `spawn`, `hold`/`letGo`, `canTarget`, `fitBuilding`, `addBuilding`.
- The W4 draw exports used by W3.

**Tests each stream adds**

| Stream | Tests |
| --- | --- |
| W1 | **Golden replays** identical. **Air:** a copter holds alt 100 ± 10 for 10 s with all values finite; a Clubber under it never damages it at cruise; an Archer and a Guard Tower do; a dead copter is on the ground within 2 s; `separate` never pushes a flier against a ground bean. **Dive:** hits a Clubber within 3 s; while `alt < 60` a Clubber can hit it. **Net:** within 1 s the copter is within 20 px of the ground; no second `liftOff` within 3 s. **Pogo:** crosses a line of 3 standing enemy Clubbers within 4 s, always targets a structure, bonks a tower, remounts after a knockdown. **Juggler:** a bomb bursts within 2.5 s and can kill a copter; a knockdown makes exactly 1 fumble, death makes 3. **Nutcracker:** a bite on a Brick deals ×1.6 and ignores the shield. **Drummer:** a Clubber's swing cycle is ×1/1.3 inside 150 px; two Drummers don't stack. **Pelican:** grabs an Archer, carries it ≥ 100 px toward its own side and drops it; never grabs a Brick, Bruiser or Jelly; a Sneeze releases it; a grabbed Bomb lights. **Jelly:** engulfs a Clubber, holds it 2.2 ± 0.1 s, spits; never engulfs a Bruiser; an engulfed Bomb hurts it ×1.6. **Brolly:** descent 2.4–3.0 s; an arrow flips it and it lands within 1 s; towers target it while floating. **Wrap:** absorbs 70, halves stun, no fall damage. **Shove:** a repeat within 1.6 s is ×0.25. **Spawn:** the queue keeps `units` sorted and no unit is visited twice in a step (instrumented counter). **Determinism:** the same seed and plays with all new cards give the same hash |
| W2 | **Card contract:** 32 cards, CARD_ORDER, 2/3/3/5/5 new per arena, rarity counts, legendaries never in arenas 0–1, every desc ≤ 80 characters, every `unit`/`spell`/`building` reference exists, no banned words (the list from the brief) in any name. **Buildings:** never give crowns; `weakest()` ignores them; decay reaches 0 at `life` ± 0.1 s; enemies can't walk through and own units can; the Brick targets a nearer building; the Box punches a Clubber ≥ 80 px back and a second punch within 1.6 s is weak; the Patch never has > 3 live Sprouts and spawns 5–7 in its life; the Crane launches an enemy that walks in and never hurts its own side; a Castle falling crumbles its buildings; a 4th building crumbles the oldest; placement is legal only in its own deploy zone (never the pocket) and never overlapping. **Spells:** Peels trip a walking Clubber within 2 s, heavies skid, immunity holds, at most 10 slips, a blast flings a peel; Sneeze moves enemies only and fliers further; Soda erupts at 1.2 s; the Anvil kills a Bruiser and brings a copter down; Wrap touches only its own team. **Match:** the `canPlay` rules for buildings and anywhere; the formation nudges |
| W3 | Every new unit, item and shape draws without throwing (canvas stub) across a scripted match; card faces for all 32 at three sizes, legendary frame included; hats seat on the six new hat-wearers; no hat on `noHat` types |
| W4 | Every building in every state (dropping, idle, punching, spawning, swinging, wilted, down) and every new spell and shot draws without throwing; the HP bar life clock; the aim ghosts |
| W5 | Every rarity table has 4 keys × 8 entries; chest legendary odds are 0 before arena 2 and 5% after; never more than 1 legendary copy per chest; `chestOdds` matches rolls (Monte Carlo); chest and shop rolls are unchanged for an arena-0/1 profile apart from the pool growth (a fixed-seed regression); the Trail holds every new card; archetypes are valid and each has an air answer; the bot plays every new kind legally in scripted scenarios (a building in its zone, an anywhere card in range, Wrap on its own push); the bot never answers air with an air value of 0 |
| W6 | The PWA precache includes the new files and VERSION is bumped; the perf test runs a scripted worst case (6.5) for 60 simulated seconds under the budget, with the threshold relative to the machine (calibrated against a baseline match run in the same test) |

---

## 10. Test plan and balance targets

**Gates, in order:**

1. Golden replays identical after Phase 0, and after any later refactor.
2. All unit tests green (`npm test`).
3. Determinism: every new card in a scripted match replays bit-identically.
4. Perf under budget.
5. Balance targets below.
6. A phone play-test at 844×390 and 667×375 (Playwright screenshots of each new card in action; readability review).

**Balance runs** (`node battle/tools/balance-arena.mjs --n 24`, then `--n 40` for the final numbers):

| Measure | Target |
| --- | --- |
| Each new card's win rate with/without (random legal decks with an air answer, equal skill 0.6, equal levels) | **40–60%** |
| Each legendary's with/without | **45–55%** (a side-grade, never a must-have; over 55% is nerfed first) |
| Any new archetype deck against any other deck (DECKS + archetypes) | ≤ 60% |
| **Any single matchup** | **≤ 65%** |
| Existing cards' with/without after the 18 arrive | still 40–62% (today 42–61%) |
| Match shape at equal skill | about 20–30% end by castle, ≤ 25% tiebreak (today about 23% / 21%) |
| +1 card level | still wins about 90–97% (today about 95%) |
| Newbie section (a player who only drags units) | still loses clearly to skill 0.3 (no card that "plays itself") |
| CPU | ≤ 2.2 CPU-s per simulated minute on average over the cards section; worst-case perf scenarios ≤ 3.0 for the peak minute |
| Brick after its retarget | ≥ 40% with/without (it now has building counters) |

**Tuning knobs, in this order** (the first numbers to move):

| Card | Knobs |
| --- | --- |
| Pogo | `bonk.damage`, `hop.vx`, `hp` |
| Pelican | `scoop.cooldown`, `carryMax`, `dropDamage` |
| Big Jelly | `hp`, `engulf.hold`, mana (6 → 7) |
| Wrecking Crane | `pump`, `hitLoss`, `damage`, `life` |
| Bubble Wrap | `absorb` (70 → 50) |
| Banana Peels | `maxSlips`, `life` |
| Big Sneeze | `push`, mana (2 → 3) |
| Juggler | `bomb.damage`, `cooldown` |
| Boing Box | `recharge`, `launch` |
| Bean Patch | `every`, `max` |
| Drummer | `BEAT` (1.3 → 1.25) |
| Propeller Pals | `hp`, `dash.damage` |

---

## 11. Open risks and fallbacks

| # | Risk | Mitigation and fallback |
| --- | --- | --- |
| 1 | **The air layer's feel and stability.** The lift spring at 120 Hz with 4 constraint iterations, the dive, the swoop, and two ragdolls tethered in a carry | Use the clamped lift (3.2) and the proven hand-of-god spring constants. Test early with W1's flight tests. Fallback for the copter: replace the dive with an acorn drop (an arrow variant) and keep the rest. Fallback for the Pelican: no carry; the scoop flings the bean up and back at once ("swoop and toss") |
| 2 | **Pogo hop locomotion** through walls, peels, knockbacks and crowds | Fallback: it walks fast (speed 100) and hops only when a bean blocks it within 60 px; everything else stays |
| 3 | **The bot can't play the new kinds well** (buildings, anywhere, fliers, own-side spells), and balance numbers hinge on that | Scripted bot tests per kind (section 9). Balance reports should be read per bot `stats` (how often each card was played and why). If the bot misplays a card badly, fix the bot before the numbers |
| 4 | **The Wrecking Crane becomes a fortress**, or is useless | Energy loss per hit, `shoveT`, a 190 px sense range, decay over 28 s. Fallback: a fixed amplitude (no pumping) and one victim per pass. Hard fallback: swap the card for a simpler legendary building with the same slot, rarity and arena |
| 5 | **Air or buildings swing existing balance** (the Brick retarget, Archers more valuable) | Golden replays prove there is no change without new cards. The balance table checks existing cards stay 40–62% |
| 6 | **Peel slip detection** misses because of lanes or planted-foot timing | Tests for walking, charging and standing beans. Fallback: trigger by hip x within 12 px and the lane |
| 7 | **Perf** with Sprouts, patches and Juggler bombs | The caps (3.7) and the perf test; lower `MAX_LIVE` and the patch `max` if needed |
| 8 | **Art volume and phone readability**: 10 units, 3 buildings, 5 spells, 7 item kinds | The silhouette rules in each card; a screenshot review at zoom 0.43; ground shadows for anything that flies |
| 9 | **Holding edge cases**: a holder dies mid-carry, a held bean over a tower wall, a held Bomb | `letGo` in `die`/`removeUnit`/`explode`; `separate` skips held units; tests per case |
| 10 | **Legendary pacing** feels slow | 4 copies on the Trail (level 4 at once); bot levels mirror yours; the shop offer. Watch `chestOdds` and adjust 5% → 7% if playtests ask for it |
| 11 | **The Pelican or Brolly feel unfair** ("my Archers vanished") | Visible swoop and descent windows, many counters, one target per 3.5 s. If the Pelican's with/without is over 55%, raise its cooldown first |

**Reserve cards** (scored well; use one if a pick fails its fallback):

- Belly Bumper: a sumo tank with a pinball belly bump, replacing Big Jelly.
- Scarecrow: a taunt decoy building, replacing the Wrecking Crane at a different rarity; the distribution must be rechecked.
- Trampoline: a two-way trap spell.
- Hamster Ball: an armoured roller that cracks into a hamster.

---

## 12. Appendix: proposal scoring and selection

Each card is scored 1–5 on five criteria:

- **F**: fun to watch as ragdoll physics.
- **C**: strategic clarity and counters.
- **O**: originality (no borrowed names; not a 1:1 clone).
- **B**: buildable in this codebase (5 = easy or low risk).
- **R**: readable on a phone at zoom 0.43.

The "Uses / fixes" column says what code a card relies on, or what the final spec changes.

### Physics proposal

Its comedy beats and art notes were the strongest of the three.

| Card | F | C | O | B | R | Verdict | Uses / fixes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Banana Peels | 5 | 4 | 4 | 4 | 4 | **Picked** | Peels made into `battle.items`, so blasts already fling them |
| Bean Patch | 4 | 4 | 3 | 4 | 3 | **Picked** (name) | Made a taller planter box for readability; caps from the strategy proposal |
| Pogo Bean | 5 | 4 | 5 | 2 | 4 | **Picked** | Merged with the strategy version; the "remount" rule avoids a mid-match type swap |
| Surprise Box | 5 | 4 | 4 | 4 | 4 | **Picked** as Boing Box | The `shoveT` anti-lock was added: one bean can't be boxed forever |
| Pie in the Sky (L) | 4 | 3 | 4 | 2 | 3 | Cut | Blinding status on units and towers is muddy to read; it would be a third flier |
| Bean Catapult | 5 | 3 | 4 | 2 | 3 | Cut | Chip damage from your own half across the map feels unanswerable; it needs new wall-stick physics |
| Bomb Juggler (L) | 5 | 4 | 4 | 3 | 4 | **Picked** | Fumble rule merged with the engineering version (1 bomb on a knockdown, 3 on death); no unicycle (cost against readability) |
| Shaken Soda | 4 | 4 | 4 | 4 | 4 | **Picked** | The cap's damage is dropped (cosmetic only) |
| Belly Bumper | 4 | 4 | 4 | 3 | 5 | Reserve | Overlaps Big Jelly as the heavy |
| Big Magnet | 4 | 2 | 4 | 2 | 3 | Cut | Niche (metal only); bending arrows is complex |
| Anvil | 4 | 5 | 3 | 5 | 5 | **Picked** | Damage from the physics version; the air carry from the engineering version |
| Hamster Ball | 5 | 3 | 4 | 3 | 4 | Reserve | Overlaps the Squire's anti-arrow role; two-stage spawn |
| Rodeo Rita (L) | 5 | 3 | 5 | 1 | 2 | Cut | The highest physics risk; unreadable at 30 px |
| Whirlybeans | 4 | 4 | 4 | 3 | 4 | Merged | Its dive-bonk became Propeller Pals' attack |
| Brolly Brigade | 5 | 4 | 4 | 3 | 5 | **Picked** | The umbrella guard is dropped (scope); a flip on hit is kept |
| Helium Gulp | 5 | 3 | 5 | 2 | 4 | Cut | Risks making defence pointless; needs friendly air rules |
| Big Fan | 4 | 3 | 4 | 2 | 3 | Cut | Soft-locks air and light decks; a per-particle wind field costs CPU |
| Snow Roller (L) | 5 | 3 | 3 | 2 | 4 | Cut | Overlaps the Cheese Wheel and Big Sneeze (another "send it home" line) |

### Strategy proposal

Its roles, counter web and bot thinking were the strongest of the three.

| Card | F | C | O | B | R | Verdict | Uses / fixes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Pips | 3 | 5 | 3 | 5 | 3 | Merged | Became Sprouts (leaf silhouette reads better) |
| Big Sneeze | 5 | 5 | 4 | 5 | 4 | **Picked** | 2 mana common; the inhale from the engineering version; `shoveT` |
| Pogo Bean | 5 | 4 | 5 | 2 | 4 | **Picked** | Merged with the physics version |
| Nutcracker | 4 | 5 | 4 | 4 | 4 | **Picked** | Moved to arena 3 ("break") |
| Prickly Pear | 4 | 4 | 4 | 4 | 4 | Reserve | Thorns are good, but there were too many tanks |
| Beanie Copters | 4 | 4 | 3 | 3 | 4 | Merged | Became Propeller Pals |
| Slingshots | 3 | 4 | 3 | 4 | 3 | Cut | Archers and the Netter already cover anti-air |
| Cannonbean (L) | 5 | 4 | 2 | 3 | 4 | Cut | Firing a unit from your tower to anywhere is a 1:1 clone of a famous card |
| Bean Pod | 4 | 4 | 3 | 4 | 4 | Merged | Its caps (per building and per side) went into the Bean Patch |
| Boing Box | 5 | 4 | 4 | 4 | 4 | **Picked** | Name taken; behaviour from both proposals |
| Syrup Spill | 3 | 5 | 3 | 5 | 4 | Cut | Banana Peels is the funnier trap; a slow zone drifts toward "permanent slow" |
| Grand Piano | 5 | 5 | 4 | 4 | 4 | Cut | The Anvil does the job at 4 mana |
| Doc Jolt (L) | 4 | 3 | 4 | 2 | 2 | Cut | Resetting a corpse's state is bug-prone; hard to see which bean came back |
| Pelican (L) | 5 | 4 | 5 | 3 | 4 | **Picked** | The carry reuses the hand-of-god spring; it carries toward its own side |
| Big Jelly (L) | 5 | 4 | 5 | 3 | 5 | **Picked** | Shares the holding feature with the Pelican |
| Bean Blimp | 4 | 4 | 2 | 3 | 4 | Cut | An air siege that drops troops on towers is too close to a famous flier |
| Tummy Drummer | 3 | 5 | 4 | 5 | 4 | **Picked** | Tempo applies only through `tempo()` (×1 when idle, so replays stay identical) |
| Bubble Wrap | 4 | 5 | 5 | 4 | 4 | **Picked** | The own-side spell |

### Engineering proposal

Its build order, refactors, caps and tests were the strongest of the three.

| Card | F | C | O | B | R | Verdict | Uses / fixes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sprouts | 3 | 5 | 3 | 5 | 4 | **Picked** | Name and stats; it is also the Patch's spawn |
| Pillow Pals | 4 | 4 | 4 | 5 | 4 | Cut | A knockback reset overlaps Sneeze, the Box and the Crane |
| Propeller Pals | 4 | 4 | 4 | 3 | 4 | **Picked** (name) | Dive-bonk attack from the physics version |
| Butterfly Netter | 5 | 5 | 5 | 4 | 4 | **Picked** | `airReach` limits it to low fliers |
| Pole Vaulter | 4 | 3 | 4 | 2 | 4 | Cut | Vault trigger heuristics misfire in 1-D crowds |
| Stunt Bean | 5 | 4 | 2 | 3 | 4 | Cut | The same famous-card concern as Cannonbean; the Brolly is the deploy-anywhere card |
| Trampoline | 5 | 4 | 4 | 4 | 4 | Reserve | A second trap would overlap Peels |
| Juggler (L) | 5 | 4 | 4 | 3 | 4 | Merged | Became the Bomb Juggler |
| Scarecrow | 3 | 5 | 3 | 5 | 4 | Reserve | A simple taunt building |
| Bean Pot | 4 | 4 | 3 | 4 | 4 | Merged | The deferred spawn queue and `MAX_LIVE` were taken |
| Jackhammer | 4 | 3 | 3 | 4 | 4 | Cut | A building-buster is niche with 3 buildings |
| Jam Jar | 3 | 5 | 3 | 5 | 4 | Cut | Same as Syrup Spill |
| Wrecking Ball (L) | 5 | 3 | 4 | 3 | 4 | **Picked**, renamed **Wrecking Crane** | "Wrecking Ball" is an existing game character's name. `hitLoss` and `shoveT` were added against fortress play |
| Hot Sauce | 4 | 4 | 2 | 5 | 4 | Cut | A speed and attack-speed buff spell is a 1:1 clone of a classic buff spell; the Drummer covers the buff role as a unit |
| Anvil | 4 | 5 | 3 | 5 | 5 | **Picked** | Merged with the physics version |
| Big Sneeze | 5 | 5 | 4 | 5 | 4 | **Picked** | Merged with the strategy version |
| Tub Admiral (L) | 5 | 4 | 2 | 2 | 3 | Cut | A flying building-hunter that drops bombs and crashes on death is too close to a famous balloon card |
| Mama Jelly (L) | 4 | 4 | 2 | 3 | 5 | Cut | A heavy that splits on death is too close to classic cards; Big Jelly's engulf is used instead |

### What came from each proposal

- **Physics:** 7 cards (Banana Peels, Pogo Bean, Boing Box behaviour, Bean Patch name, Bomb Juggler, Shaken Soda, Anvil, Brolly Brigade, Propeller Pals' dive), the comedy beats and the art notes.
- **Strategy:** 7 cards (Big Sneeze, Pogo Bean, Nutcracker, Pelican, Big Jelly, Tummy Drummer, Bubble Wrap, Boing Box name), the arena-as-decision framing, the counter web, the bot classes and the "legendaries are side-grades" targets.
- **Engineering:** 6 cards (Sprouts, Propeller Pals name, Butterfly Netter, Wrecking Crane, Anvil and Big Sneeze details), Phase 0 (golden replays, `blastAt`, `takesOf`, the deferred spawn queue, `MAX_LIVE`), the building-as-`Tower` approach, the ranged-at-buildings bug fix, and the test-per-card discipline.
