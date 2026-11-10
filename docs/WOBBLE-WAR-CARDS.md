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

**Every number here is the shipped value.** The document started as the build
contract with starting values; the build and the balance passes moved some of
them and settled a few rules the first draft left open. Those changes are folded
into their sections, and section 13 lists each one against the first design,
with the measured balance. Tune numbers with `battle/tools/balance-arena.mjs`
(and `--set`). Don't change rules, field names, event names or file ownership
without updating this document.

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
13. As shipped: what changed from the first design, and the measured balance

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
| 24 | `beanPatch` | **Bean Patch** | B (spawner) | rare | 3 | 3 | Sprouts |
| 25 | `anvil` | **Anvil** | S · AA | rare | 3 | 4 | – |
| 26 | `nutcracker` | **Nutcracker** | U | epic | 3 | 4 | 1 |
| 27 | `wreckingCrane` | **Wrecking Crane** | B (defensive) | legendary | 3 | 6 | swings |
| 28 | `brollyBrigade` | **Brolly Brigade** | U · A | rare | 4 | 4 | 3 |
| 29 | `bubbleWrap` | **Bubble Wrap** | S · O | epic | 4 | 3 | – |
| 30 | `tummyDrummer` | **Tummy Drummer** | U (support) | epic | 4 | 3 | 1 |
| 31 | `pelican` | **Pelican** | U · F | legendary | 4 | 5 | 1 |
| 32 | `bigJelly` | **Big Jelly** | U | legendary | 4 | 7 | 1 |

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
| Mana | New cards cost 1–7 (average 3.61); all 32 cost 1–7. The balance pass moved three: Bean Patch 4 → 3, Tummy Drummer 4 → 3, Big Jelly 6 → 7 |

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
const c = this.act && this.act.scoop ? LIFT_C * 2 : LIFT_C;  // a Pelican holds steady in a swoop and a carry
let fy = this.supportMass * (LIFT_K * (ty - hip.y) - c * hipVy - G);
fy = clamp(fy, -4 * G * this.supportMass, 1.5 * G * this.supportMass);
hip.fy += fy * m * (this.liftOffT > 0 || !this.alive ? 0 : 1);   // m = conscious: stunned fliers sag
```

- **`altWant`** is reset to null at the top of `animate()` every substep, so a mechanic that wants another height (the dive's climb, the swoop, the carry) sets it every substep.
- **Horizontal.** The normal walk drive, with the ground factor `gF` forced to 1. While the lift is on, a flier reports `groundF = 1`, so `think()`'s `startAttack` condition (`groundF > 0.6`) holds in the air. With the lift off (`liftOffT`, knocked down, dead) `groundF` is computed normally.
- **No lift, no plans.** While its lift is off (its own dive, a net, an anvil, a soda) a flier does nothing in `think()`: no walking drive, no new attack, and it keeps its target. (Otherwise a netted Pal "walked" along the dirt and dove from the ground.)
- **Deploy.** A played flier drops in like any unit; it stops `dropping` once the propeller has slowed its fall below 30 px/s, with no `land` event and no brace.
- **Legs.** Fliers always use the existing "airborne cartoon run" leg branch at half rate (lazy paddling). They never plant feet and never emit `step`.
- **Upright pull** as normal. A flier's pose `lean` can tilt it; the Pelican flies leaning ~1.1 rad, nearly horizontal.
- **Contact with ground beans.** None needed: `separate()` already skips pairs more than 34 px apart in y. Enemy fliers at the same height push each other as usual.
- **Tower walls are unchanged and physical.** Parts below a tower's roof are pushed out. Propeller Pals at alt 100 (head top about −147) **stop at a Guard Tower's face** and dive at it. A Pelican at alt 200 passes over Guard Towers and buildings: its lowest part (the dangling feet) stays above a Guard Tower's roof (−150) in every lane, bob included (−191 / −182 / −173 in the near, middle and far lanes), and above the 170-tall Wrecking Crane. A Castle is a wall all the way up, so nothing ever gets behind it.
- **Knocked down** (stun ≥ 0.85 or conscious < 0.12). The lift sags with `conscious`, so the flier drops, lands, gets up dizzy, and the lift brings it back up as `conscious` recovers.
- **Dead.** The lift is 0 and it falls with gravity. On the first body contact with the ground at impact > 320 it emits `crash {unit, power}` (instead of `land`; later bounces emit `land`). `power` is `impact / 900`, clamped to 0..1.5. A crash deals no damage. The corpse fades like any other.
- **Fall damage.** None while the lift is on, and none during its own dive or while the lift is climbing back. A netted or knocked-down flier takes normal fall damage (that is the point of the net).
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

The Sandbox's `findTarget` also skips high fliers a unit can't hit (it would chase them forever); held beans stay targets there.

**Hits.** `resolveMelee`, `resolveDash`, the bite, the stomp, the Boing Box punch and the Jelly bump skip `e.air` targets, unless the attacker has `hitsAir` (the Netter). Arrows, bolts, cannonballs and blasts stay purely physical: whatever they touch, they hit.

### 3.3 Buildings

A building is a **`Tower` with `kind: 'building'`**. It lives in `battle.towers`, so walls (`towerWalls`), melee against towers (`meleeTower`), pounces, arrows (`stickInTower`), blasts, quakes, spells and the cheese wheel all reach it with no new code. A building is a wall to enemy bodies. Teammates walk past their own.

**Placement** (`Match.canPlay` / `play`):

- **Zone.** Only inside your own `WORLD.deploy[team]`, never in the pocket, even after the enemy Guard Tower falls.
- **Fitting.** `fitBuilding(battle, team, bid, x)` (in `sim/buildings.js`) returns a legal centre x or `null`. It searches from x outward in 4 px steps up to `BUILD_SNAP = 80`, in the order x, x + 4, x − 4, x + 8, x − 8, … The first x wins where the footprint `[x − w/2, x + w/2]` is inside the deploy zone and at least `BUILD_GAP = 12` px from every standing tower and building of either team. `null` makes `canPlay` return `'zone'`.
- **Pinches.** `BUILD_GAP` (12 px) is narrower than any bean, so a building played beside a structure of its side can leave a bean in a gap it doesn't fit: each wall pushes it out of its own footprint into the other's, every step. So `towerWalls` ends with **`Battle.unpinch()`**, which runs only while a building stands (`battle.towers` holds one; the 14 original cards never get there). A bean the walls leave overlapping an enemy structure (hip within `w/2 + r − 1` of its centre, below its roof) moves out past the whole row of that side's structures whose gaps are narrower than `2R + 2`, to the row's outer face, all its parts and feet at once (x and px together, so it keeps its speed). The side is the one the walls would put it on: out of a building, the bean's own side (blue beans to −x, red to +x); out of a Guard Tower, the side its hip is on; out of a Castle, the field side. If that row runs into a Guard Tower or a Castle, it tries the other side (never behind a Castle), and only if neither has room does it go out on its own side through the tower. So a bean that got behind your tower and lands between it and a building stays behind the tower. Held beans are skipped.
- **Cap.** At most **`MAX_BUILDINGS = 3` standing buildings per side.** Playing a 4th makes the oldest one crumble (`destroyTower(b, oldest, true)`, cause `'crumbled'`).
- A building card places exactly one building. `Match.formation()` returns `[fitX]` for ghosts, or `[]` when the spot is illegal.

**Arrival.** `battle.addBuilding(bid, team, x, level)` creates it at once: it is solid and can be damaged from the first step.

- **Drop.** `landT` counts up from 0 at placement. For `landT` 0 → 0.35 s (`LAND_T`) the renderer draws it falling from 300 px up as a crate (the patch as a clod of dirt), and its HP bar waits until it lands, then fades in over 0.15 s. At 0.35 s it emits `buildingLand`. Enemy ground beans touching the footprint (hip within `w/2 + R` of the centre; not held, not high air) then get `addVel(0, −220)`; `towerWalls` has already pushed them out sideways, since a building is a wall from the step it is placed. There is no damage.
- **Arming.** It starts working (punch, spawn, pump) `arm = 1.0` s after placement, the same as a unit's deploy time.

**Lifetime.** `t.hp -= t.maxHp / def.life * dt` every step from placement, silently: no events and no damage numbers. At 0 it is destroyed with cause `'decayed'`. The HP bar shows a small clock pie (`t.age / def.life`). Decay and work run only while the match is in its `'battle'` phase: once a match is over, nothing new starts and nothing is hit (the glove goes home, the ball swings down, no spawns). Lifetimes are 24 s (Bean Patch), 28 s (Boing Box) and 36 s (Wrecking Crane).

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
  if (t.kind === 'building') return t.takes[kind] ?? 1;   // t.takes = BUILDING_TAKES, set by makeBuilding
  return override ?? TOWER_TAKES[kind] ?? 1;   // override = X.vsTower / Q.vsTower / attack.vsTower (stone only)
}
```

`takesOf` reads the building's table from `t.takes` rather than importing `BUILDING_TAKES` into `towers.js` (that would be an import cycle). It is the same object, so `--set BUILDING_TAKES.x=…` still works.

**Never crowns.**

- `destroyTower(b, t, crumble)` has an early building branch. It sets `alive = false`, `hp = 0`, `downT = 0` and marks its arrows to fade. It emits **`buildingDown {tower, team, bid, cause}`** and **never `towerDown`**. It gives no crowns and wakes no castle.
- `damageTower` never calls `wakeTower` for a building (buildings are `active: true` anyway).
- `Match.weakest()` and the tiebreak skip buildings. Overtime is decided by crowns only, so destroying a building ends nothing.
- When a side's Castle falls, the existing crumble loop also crumbles that side's buildings (cause `'crumbled'`).
- The bot's `towers.mine/theirs` exclude buildings.
- `updateTowers` (`towers.js`) removes a fallen building's wreck from `battle.towers` once `downT > WRECK_T = 3` s.

**Level.** A building's hp, its damage and the level of the units it spawns all follow the card level (`levelMul`).

### 3.4 Deploy-anywhere (Brolly Brigade)

- **Card flag.** `anywhere: true`.
- **Where it can be played.** `Match.canPlay` accepts x in `[40, 1460]` for these cards, at any time.
- **Where a bean may not land.** `Match.blockedSpans()` lists open `[a, b]` spans of x: every standing tower or building footprint widened by 16 px each side (`|x − t.x| < t.w/2 + 16`, so a clear bean sits at `t.x ± (t.w/2 + 16)` or further), each Castle (standing or not) from 16 px past its field-side face out to the world's edge behind it, and everything outside `[40, 1460]`.
- **Formation.** `Match.formation()` keeps the card's `spread` offsets around one centre: the centre **nearest the aim** (the lower x on a tie) at which every bean is clear. The candidates are the aim itself and every span edge minus each bean's offset (a bean sitting exactly on an edge), so the answer is exact, not a slide that can bounce between two structures. Only when no centre has room for the full spacing does each bean take its own `Match.clearSpot(aim + offset)`. Aimed at x 60 the three land at 201 / 231 / 261, at 1440 at 1239 / 1269 / 1299, at 1130 (on the red Guard Tower) at 1062 / 1092 / 1122. (Nudged one by one, they all landed on the same edge; slid as a block, off one structure and onto the next, they could still stack or wedge between two structures standing closer than a bean is wide.)
- **One bean's spot.** `Match.clearSpot(x)` merges the overlapping spans first, so two structures close together count as one, and moves x to the nearer edge of the merged span it is in (a Castle's edge is always its field side). Its answer is always clear.
- **Deploy.** `addUnit(card.unit, team, x, lane, seed, { level, float: true })` calls `battle.floatIn(u)` instead of `dropIn(u)`.
- **Towers can shoot them.** Floating units are not `dropping`, so towers can shoot them all the way down. That is the counterplay.
- **Seen on the way in.** The renderer fades a Brolly in over its first 0.35 s and keeps it see-through while its umbrella is still under the match HUD's top row (at 844×390 the drop height is right under the clock, so it drifts out from under it about 0.5 s after the play). Render only: in the sim it is solid and shootable from the first step, and its ground shadow and the aim markers show from the first frame.

### 3.5 Statuses (fields on `Unit`, all 0 by default, counted down in `post()`)

| Field | Set by | Effect |
| --- | --- | --- |
| `shoveT` | any hit with `hit.shove: true` (Big Sneeze, Boing Box punch, Wrecking Crane, Jelly spit) | **Anti-lock.** If `shoveT > 0` when a shove lands, its `dvx/dvy` are ×0.25 and its stun ×0.3. Then `shoveT = 1.6`. Nothing can keep one bean bouncing out of play. (`SHOVE = { time: 1.6, knock: 0.25, stun: 0.3 }` in `unit-types.js`) |
| `slipImmuneT` | Banana Peel slip (set when the bean gets up: 1.5 s) | can't slip again. Set at the slip to `downT + immune` (the two count down together, so it ends 1.5 s after the bean is up); a heavy's skid sets it to `immune` |
| `liftOffT` | Netter (1.8), Anvil (1.2), Shaken Soda (0.6) | flier lift = 0 (`u.liftOff(b, t, from)` max-stacks it and emits `liftOff`) |
| `netImmuneT` | Netter (3.0) | a new net hit gives only the ground payload (no `liftOff`) |
| `beatT` | Tummy Drummer (0.6 per beat) | `tempo()` = 1.5, `moveMul()` = 1.5 |
| `wrapHp`, `wrapMax`, `wrapT` | Bubble Wrap | absorbs damage first; stun ×0.5 (if wrapped when the hit lands, judged before the absorb); no fall damage; body bounce 0.6 (re-applied every step while it holds); it also ends when its bean dies |
| `squashT` | Anvil (1.0) | render: pancake squash, about the bean's own feet (a flier is squashed where it flies, not down on the lane). Set only on a survivor that is down, whose `downT` becomes at least `squash`: it is drawn flat exactly while it lies there (a wrapped bean that stays up is not squashed) |
| `floatT`, `flipped`, `flipFall` | Brolly (`floatIn`) | drag-capped fall; `air` while high; `flipped` = umbrella inside out; `flipFall` = falling after a flip (`think()` idles) |
| `held`, `heldBy`, `holding` | Pelican, Big Jelly | see 3.6 |
| `spawnOf` | Bean Patch spawns | id of the building that spawned it |
| `dropSlam` | Pelican release | takes `dropDamage` (`takeHit` kind `'slam'`, no knock) if the bean fell faster than 320 px/s before it first touches the ground (body or foot); a slower drop clears it with no damage |

**Speed and tempo helpers** (`unit.js`). They must be **exact no-ops** (×1) when no status is active, so golden replays stay bit-identical:

```js
tempo() { return this.beatT > 0 ? BEAT.tempo : 1; }      // BEAT from unit-types.js: { tempo: 1.5, move: 1.5 }
moveMul() { return this.beatT > 0 ? BEAT.move : 1; }
```

- **Where `tempo()` applies.** `a.t` in `animate()` (every phase but a melee `'strike'` and a dash's flight), `animateDash()` (windup and recover only, never the flight), `animateBow()`, the Juggler toss, the Nutcracker bite, the Pelican and Jelly act timers, `cooldown` countdown, and Pogo hop rest.
- **Where it never applies.** Fuses (`a.phase === 'fuse'` and `deathFuse`), `deployT`, `downT`, dash flight time, a melee strike (`a.phase === 'strike'`) and building timers. A heavy weapon needs its whole strike to sweep through the target: swept 1.5× faster, the Brick's hammer and the Bruiser's club whiffed (0 hammer blows on a tower with a Drummer beside the Brick). So on the beat a swing (windup to the end of its recover) takes `(swing − strike)/1.5 + strike`: a Clubber's 1.05 → 0.74 s, a Brick's 1.53 → 1.07 s. With the cooldown also ×1.5, that is about 1.4× as many swings.

**Hits that floor** (`hit.floor: true`, set only by a peel's slip and the Anvil). In `takeHit` their knockdown check uses the hit's stun **without poise** (only Bubble Wrap's ×0.5 still applies), so armoured beans (Squire, Shield Wall, Bruiser, Nutcracker, Pogo) go down like anyone. Other hits keep the existing rule: poise scales the stun, and only a full-speed club bonk mostly ignores it.
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
- **No pushing.** `separate()` skips any pair that contains a held unit (and leaves held corpses out of the corpse pile).
- **No walls while held.** `towerWalls` skips a bean held by a holder (`u.heldBy`), so a Pelican carries its catch home past its own Guard Tower (the wall used to pin the catch while the beak pulled it). Once dropped, walls apply again: a bean let go inside a footprint is pushed out to its side as it comes down.
- **Release.** `removeUnit`, `die` and `explode` of either partner call `letGo`. `battle.letGoOf(holder, why, dvx, dvy)` lets go and emits `letGo`; the Sneeze and the early releases use it. A bean that dies in a beak is dropped; one that dies inside a Jelly is popped out at `(f·160, −220)`. `why: 'death'` covers the holder's death and the victim's.
- **Only light units can be held:** `mass <= 1.0`, alive, on the ground (not `air`), `deployT <= 0`, not held, not floating, not a flier, not a building (`liftable(e, maxMass)` in `battle.js`).

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
| Boing Box, Wrecking Crane, Big Sneeze | `shoveT`: a second shove within 1.6 s is ×0.25. The Box's punch cycle takes about 1.8 s; the Crane loses 15% of its swing into every bean it hits and must pump back up |
| Butterfly Netter | 3 s of `netImmuneT` after a net; `liftOffT` never stacks |
| Pelican | one bean at a time, carried 2.0 s at most, then 3.5 s of cooldown; heavies can't be lifted; many ways to make it drop (3.6, card 31) |
| Big Jelly | one bean at a time for 1.6 s, then 1.5 s of cooldown (after any release, not only a spit) |
| Air | towers and Arrow Rain hit air from Arena 0; Archers too; fliers are fragile |
| Brolly Brigade | about 2.7 s of descent while towers shoot it (the renderer fades it in over its first 0.35 s, see 3.4); not inside Castle rectangles |
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
  light: true,                                       // its pokes and bumps shove only as hard as its weight allows (LIGHT_KNOCK)
  attack: { windup: 0.16, strike: 0.08, recover: 0.18, cooldown: 0.22, damage: 11, knock: 90, stun: 0.15, shieldPierce: 0.35, cleave: false },
  poses: { // the Squire's stab, ×0.6
    rest: { main: [4, -4], off: [6, 0], ang: -38, lean: 0.05, crouch: 0, wk: 1 },
    windup: { main: [-4, -2], off: [6, 1], ang: -8, lean: -0.2, crouch: 2, wk: 1.4 },
    strike: { main: [13, -2], off: [6, 1], ang: 2, lean: 0.3, crouch: -1, wk: 2.6, hk: 2.2 },
    cheer: { main: [2, 10], off: [5, 4], ang: -85, lean: -0.05, crouch: 0, wk: 1 } },
},
```

- **Behaviour.** A standard melee bean: the nearest enemy ground bean in sight, else the nearest structure. It is also what the **Bean Patch** spawns.
- **A lightweight** (`light: true`, `LIGHT_KNOCK = 2.25` in `unit-types.js`). It shoves another bean only as hard as its own weight allows: its weapon's knock (a hit or a shield block) and its push in `separate()` (the overlap share and the closing-speed bleed) are ×`min(1, (2.25 · its mass / the other's mass)²)`. That is ×1 on anything up to a Clubber's weight, ×0.6 on a Nutcracker, ×0.21 on a Bruiser and ×0.06 on a Brick. In an overlap the Sprout takes the rest of the push itself: it gives way. (Before, a pair of Sprouts, or a Bean Patch's three, shoved a walking Brick 100–150 px back up the field, so the Brick never reached the Patch it is listed against.) The factor is exactly 1 for every other unit.
- **Physics beat.** It weighs nothing (mass 0.45, heft 1.5), so any club hit sends it cartwheeling half the field, squeaking. It bounces, gets up and sprints straight back in. Two Sprouts poking a Brick's ankles while it ignores them and walks on.
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
{ kind: 'peel', team, a, b, con, age: 0, life: 8, uses: 2, used: false, laneY, dmgMul, spell }
```

`dmgMul` is the caster's `levelMul` (read by `Unit.slip`) and `spell` is the cast's entity.

- **The toss.** The 5 peels are tossed in from 260 px above, spread evenly across `[x − radius, x + radius]` with `b.rng` jitter, each on a random lane (`laneY = WORLD.groundY + rng·laneDepth`; the particles' `ground` = `laneY`). They land after about 0.4 s.
- **Fading.** `reap()` fades an item at `it.life ?? ITEM_FADE_AT`; this `life` override is new.
- **Blasts move them.** Quakes, blasts and the Boulder already push items, so they fling peels around, and a flung peel works again wherever it lands.

**Slip check** (`spells.js` `updatePeels(b, dt)`). It runs while any peel item exists.

- **A peel is active** while its age ≥ `minAge`, both particles are on the ground, and its speed is below 40 px/s.
- **Who can slip.** Each enemy unit that is alive, not `gone`, `deployT ≤ 0`, `slipImmuneT ≤ 0`, not held, not knocked down, and **on its feet**: hips within 10 px of their standing height (for a Pogo, `groundF > 0.8`). Fliers and floaters never slip. (`groundF > 0.8` alone shut out a Sprout, whose bouncy walk keeps it at about 0.75, and a Big Jelly at about 0.55.)
- **The trigger.** For each foot i: if `u.feet[i].plant`, `|u.foot[i].x − peelX| ≤ trigger` and `|u.ground − peel.laneY| ≤ laneTol`, then `u.slip(b, peel)`.
- **Pogo.** A Pogo slips when its stick tip *lands* within `trigger` px of a peel.

**`Unit.slip(b, peel)`** (`unit.js`). Here `dir` = the unit's walking direction (its `f`).

- **The slip.** Feet and knees get `addVel(dir·feet, −220)`, head and chest `addVel(−dir·head, −60)`, the hip `addVel(dir·60, −hipUp)`.
- **The hit.** Then `takeHit(b, { damage: damage·peel.dmgMul, dvx: 0, dvy: 0, stun: 1.0, kind: 'slip', floor: true, x, y })`. That floors it, with the existing `downT` roll of about 1 s, **whatever its poise** (`floor`, 3.5): the Squire, Shield Wall, Bruiser, Nutcracker and Pogo go feet-up like anyone. Only Bubble Wrap's stun ×0.5 keeps a wrapped bean up. `slipImmuneT` is set at once to `downT + immune`, so it runs out `immune` s after the bean gets up.
- **Heavies** (`mass ≥ heavyMass`: Brick, Big Jelly) don't fall. They skid: hip `addVel(dir·skid, 0)` and `wobbleT = skidWobble`, with no damage, and `slipImmuneT = immune` (else a Brick standing on one peel would skid every step).
- **Events.** `slip {unit}`, or `skid {unit}`.

**The peel afterwards.** A peel that tripped someone (a heavy's skid counts the same) is kicked backward: `addVel(−dir·kick, −120)` with spin, and `peelKick` is emitted. Its `uses` drops by 1, and it turns brown (`used`). At 0 uses it fades 0.6 s later. A cast never trips more than `maxSlips` beans in total.

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
  hp: 50, radius: 10.5, bodyLen: 18, speed: 78, mass: 0.55, heft: 1.4, heftUp: 1.3,  // light: a club bat is a home run
  weapon: 'none', noHat: true, body: { thigh: 10, shin: 10, upperArm: 7, foreArm: 7 },
  flying: { alt: 100, bob: 8 },
  engage: 40, reach: 95,                           // hovers ~40 px short of its target (along x), dives from up to 95 px
  dash: { kind: 'dive', windup: 0.35, climb: 26, speed: 380, time: 0.5, recover: 0.6, cooldown: 0.7,
    damage: 20, launch: [150, 120], stun: 0.35 },
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
2. **Dive.** `liftOffT = time`. Every part gets `setVel` toward the target's head (or the tower's face at mid-height) at `speed`, with a little lead (the target's hip vx, clamped to 150 px/s, times the flight time) and aimed `0.5·G·t²` high for gravity; with no live target it dives at the dirt 60 px ahead. It emits `dive {unit}`. `striking = true`, and `resolveDash` works as it does for the Spiker, with hit kind `'dive'` (`'peck'` for a type with `scoop`, the Pelican). On a hit, bean or tower, it rebounds with `setVel(−f·120, −260)`, without the Spiker's −0.3 consciousness.
3. **Recover.** The lift comes back on to cruise alt.

At the bottom of a dive it is **below `AIR_MIN` for about 0.25 s**, so melee may target it and the swing decides the hit. A club hit on something this light (heft 1.4) is a home run. A diving or climbing flier takes no fall damage and doesn't scream.

- **Death.** The lift goes off and the bean drops like a stone. The cap pops off as an `fxRng` item, `{ kind: 'propCap', team, f, R, a, b, con, age, life: 7, flutter: 50 }`, that spins up and away, then flutters down like a maple seed (items with `flutter` fall no faster than that many px/s and sway). Emits `propOff {unit}`.
- **Physics beat.** Three tiny beans sputter in and bonk heads like woodpeckers. A home-run swing. Caps fluttering down after the fight. It calls back to the shop's Propeller Cap ("Does not fly. We checked.").
- **Job.** Cheap air chip that melee-only decks can't touch (Brick, Bruiser, Big Jelly). It distracts the tower, and it defends against a Brick.
- **Counters.** One Arrow Rain kills all three (63 against 50), as do Archers, towers, the Netter, Big Sneeze, the Juggler, and a well-timed club at the bottom of a dive.
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
  poses: {  // both hands on the handlebar, the stick straight down (its tip just touching the dirt when it stands)
    rest: { main: [5, -17], off: [3, -17], ang: 90, lean: 0.05, crouch: 0, wk: 1.2 },
    cheer: { main: [4, -17], off: [2, 14], ang: 90, lean: -0.05, crouch: 0, wk: 1.2 } },
},
// WEAPONS (unit-types.js)
pogo: { len: 34, tipMass: 0.5, tipR: 3, grip: 8, react: 0.2 },
```

**Locomotion** (`unit.js`, for `type.hop`):

- **The stick.** The stick is the weapon tip, held straight down (pose `ang: 90`). Its tip is the "foot": it sits `stickBelow` px under the feet. The feet are tucked on the pegs; in `legs()` they spring to `(hip.x ± 3, hip.y + legLen·0.7)`.
- **Support.** The hip support spring targets `ground − (legLen·0.7 + stickBelow)`. `groundF` comes from the hip's height over its standing height (a 5 px band): the stick is held straight down, so its tip is on the dirt exactly when the hip stands there, and a stick flopped about by a knockdown can't fake a touchdown.
- **The hop.** When `groundF > 0.8`, `hopCool ≤ 0`, `conscious > 0.6` and the unit is not down, every part's velocity is **set** to `(f·vx, −vy)`, so every hop is the same whatever the landing speed. Then `hopCool = rest·(1/tempo)` (it runs down only while the stick is on the ground) and it emits `boing {unit}`. That gives an apex of about 75 px, a hop of about 95 px, and about 110 px/s on average.
- **At its target structure** (face distance < `bonk.reach` + 20) it hops nearly in place (`vy = wallVy`), edging in at `clamp((gap − R − 2)·4, 0, hop.vx)` so it gets within `bonk.reach`. At each touchdown within `bonk.reach` of any enemy structure's face it bonks: `damageTower(b, t, bonk.damage·dmgMul·takesOf(t,'melee'), …, 'pogo', u)`, with a 60 px/s rebound. That is about 20 every 0.7 s.
- **Over beans.** `separate()` skips enemy pairs while the Pogo is `hopping` (from the boing to its next touchdown) or above `hop.overAlt`. It only collides with beans while touching down.
- **Stomp.** In `post()`, while falling (tip vy > 0), if the stick tip comes within `e.R + 4` of an enemy head, that enemy takes `stomp.damage` and `stun`, pushed down (`dvy 120`, spin 0.2), plus a squash kick (`sqv += 8`). The Pogo's vertical speed becomes `−vy·bounce·0.8`, once per hop. Emits `stomp {unit, victim}`. No stomps while the Pogo itself is held.
- **Knocked down.** The usual `downT`: the stick flops around (it is a weapon tip). When it gets up, `hopCool = max(hopCool, remount)`: `remount` s of "climbing back on" with no hops.
- **Death.** `dropWeapon` makes it a `'pogo'` item with **bounce 0.8** (override in `dropWeapon` for this kind): boing… boing… boing.
- **Targeting.** Structures only. It is a **ground** unit (no `flying`), so melee may target it and the timing decides the hit. Archers and towers hit it normally.
- **Physics beat.** Boing-boing over a whole defensive line, stomping two heads on the way, while a Clubber swings at the air where it was.
- **Job.** A fast win condition and a punisher. Play it at the bridge right after they spend mana. It pairs with cheap cycle cards (Sprouts, Sneeze).
- **Counters.** Any building, which pulls it (the nearest structure) and holds it under tower fire. The Boing Box punches it out of the air (its glove tests the Pogo's stick as well as its body, card 23). Knockdowns: Cheese Wheel, Boulder, a full-speed club at touchdown. Banana Peels on the landing spot. The Pelican lifts it away. It has only 260 hp, so tower plus Archers works.
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
  hp: 250, radius: 13.5, bodyLen: 24, speed: 62, weapon: 'net',
  hitsAir: true, airReach: 130, prefersAir: 280,   // picks any targetable flier within 280 px first
  engage: 42, reach: 54, engageAir: 16, reachAir: 48,
  attack: { windup: 0.3, hold: 0.05, strike: 0.14, recover: 0.4, cooldown: 0.35, damage: 42, knock: 160, stun: 0.3, shieldPierce: 0.45, cleave: false,
    air: { damage: 45, liftOff: 1.8, yank: 300, stun: 0.9, immune: 3 } },   // (it holds its own on the ground: most fights have no fliers)
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

**Against a flier** it walks under it (`engageAir`, `reachAir` measured along x). `startAttack` picks **variant 1** (`windup2`/`strike2`) when its target is a flier, and variant 0 otherwise. The variant-1 scoop sweeps up past anything that isn't a flier (it starts low, and a bean under the flier used to end the swing before the hoop got there); the ground swat (variant 0) hits whatever it touches, fliers included.

**On a net hit against a flier** (`resolveMelee`: the hoop's swept tip, `tipR` 13, against an `air` or low flier, attacker `hitsAir`), unless `netImmuneT > 0`:

- `damage 45 · dmgMul`, `stun 0.9`.
- `liftOffT = max(liftOffT, 1.8)`, every part gets `addVel(0, +yank)`, and `netImmuneT = 3`.
- Emits `netted {unit, from}`.
- The flier crashes into the dirt and is a ground target for everyone until its lift comes back.

While `netImmuneT > 0` a net hit on a flier is only the ground swat below (no `netted`, no lift-off, no yank), so nothing keeps a flier floored.

**Against ground** it is a plain melee hit: 42 damage, knock 160, stun 0.3.

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
bigSneeze: { inhale: 0.4, damage: 32, push: 500, up: 140, falloff: 0.4, stun: 0.3, air: 1.8 },
```

The entity is `{ kind: 'sneeze', team, f, x, y, t, radius, state: 'inhale' | 'blow' | 'fade', done }`. It emits `spellCast` at once.

**Inhale (0.4 s).** Purely visual: a pepper-nose cloud swells and the hats in the circle tilt toward it.

**Blow** (one pass at `t = inhale`). Emits `sneeze {spell, radius}`. Every enemy unit (alive, not gone) with `|e.hip.x − x| ≤ radius + e.R·0.5`, at any height, takes:

```js
takeHit(b, { damage: 32·dmgMul, dvx: f·push·(1 − falloff·d/radius)·(e.type.flying || e.floatT ? air : 1),
  dvy: −up, stun: 0.3, kind: 'sneeze', shove: true, spin: 0.5, x, y })
```

- `f` is the caster's facing, so the shove goes toward the enemy's own side. `takeHit` applies heft, so heavies barely move.
- **Holders let go.** If the enemy is holding something (Pelican, Jelly), it lets go (`letGoOf(holder, 'sneeze', f·150, −150)`) and emits `letGo {unit, victim, why: 'sneeze'}`. A Big Jelly's engulf cooldown starts on any release, so it can't swallow the same bean again a step later.
- **Hats.** It pops every hat in the circle (`popHat`), not only on hard hits.
- **Structures.** Towers take `32·0.5`, buildings `32·0.75`.
- **Never** a knockdown on its own (stun 0.3).

- **Physics beat.** The whole push leans back as if in a wind tunnel, hats fly off in a line, Propeller Pals spin away like leaves, and a Pelican drops its catch in surprise.
- **Job.** The 2-mana reset: push a crowd out of tower range, push a Pogo or Bomb back, peel fliers off a tower, rescue a held bean, finish Sprouts. Its damage stays small (32, less than a Sprout's 36 hp): it buys time, it doesn't kill.
- **Counters.** Heavies barely move (Brick heft 0.3, Big Jelly 0.35, Bruiser 0.55). Shields and Squires slide less (heft 0.7). Bubble Wrap soaks the damage. You can just play after it: nothing lingers.
- **Art.** A pale grey-green cloud (`#d8e8c8`) with a big pink cartoon nose (`#f29c9c`), droplets on the blow, wind streaks.
- **Card art.** The cloud and nose mid-ACHOO, two hats tumbling out of frame.

#### 21. Shaken Soda (`shakenSoda`): the delayed geyser

```js
shakenSoda: { id: 'shakenSoda', name: 'Shaken Soda', kind: 'spell', spell: 'shakenSoda', radius: 75, mana: 3, rarity: 'epic', arena: 2,
  desc: 'Shake, shake, shake... POP! Everything on top goes straight up.' },
```

```js
shakenSoda: { fuse: 1.2, damage: 65, lift: 900, side: 80, stun: 0.6, airLiftOff: 0.6, erupt: 0.6 },
```

The entity is `{ kind: 'soda', team, f, x, y, t, radius, state: 'fizz' | 'erupt' | 'fade', shake, done }`.

**Fizz.** The bottle drops cap-up into the ground at x (render: about 0.15 s) and shakes for `fuse` seconds. `shake` goes 0 → 1 for the renderer. This is the warning.

**Erupt** (one pass at `t = fuse`). Emits `sodaErupt {spell, radius}`. Every enemy with `|e.hip.x − x| ≤ radius + e.R·0.5`, at any height, with `k = 1 − |dx|/radius`:

```js
takeHit(b, { damage: 65·dmgMul, dvx: sign(dx)·side·k, dvy: −lift·(0.5 + 0.5k), stun: 0.6, kind: 'soda', spin: 0.6, flip: 90·k })
```

- **Fall damage.** Light beans fly about 300 px up and take the existing fall damage on landing (about 20, plus 0.4 consciousness). Heavies lift little (Brick `heftUp` 0.35), so the physics does the scaling.
- **Fliers** also get `liftOffT = max(·, 0.6)`, so they tumble. A Pelican lets go (its stun rule).
- **Towers** within reach take `65·0.5`, buildings `65·0.75`.
- It does not light Bombs. The eruption lasts `erupt` s (render only), then the empty bottle stays 0.5 s in state `'fade'` and the entity is done.

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
  hp: 230, radius: 13.5, bodyLen: 24, speed: 55, mass: 1.0, weapon: 'none',
  ranged: true, hitsAir: true, range: [200, 240],          // Archers (230–300) outrange it
  // (a slow lob: every bomb that lands on a bean floors it, so the rate of fire is what makes it strong)
  attack: { toss: true, draw: 0.55, recover: 0.45, cooldown: 2.0, maxSpeed: 700, spread: 0.06 },  // (fast enough to lob up at a Pelican)
  bomb: { r: 6, bounce: 0.4, fuse: 0.6, maxAge: 2.5, radius: 65, damage: 40, launch: 380, friendly: 0.2, chain: 0.4, vsGiant: 1.3, vsTower: 0.5 },
  fumble: { onDown: 1, onDeath: 3, every: 4, delay: 0.5, spread: 35 },
  poses: {
    rest: { main: [6, 10], off: [-4, 10], ang: 0, lean: 0, crouch: 0, wk: 1 },       // hands up, juggling
    toss: { main: [-8, 14], off: [6, 8], ang: 0, lean: -0.2, crouch: 2, wk: 1 },      // throwing arm back
    cheer: { main: [6, 16], off: [-6, 16], ang: 0, lean: -0.05, crouch: 0, wk: 1 } },
},
```

**Attack** (`animateToss`, the act phases `'draw'` → `'recover'`, the same timing contract as the bow; `'toss'` is only the pose's name, and a Juggler emits no `bowDraw`). `solveAim(u, target)` is reused with `maxSpeed 700`, and for a toss it may aim up to 1.35 rad (`TOSS_ELEV` in `battle.js`; arrows keep 0.85, so every Archer shot is unchanged). So the bomb lobs high enough to burst on a Propeller Pal at cruise or a Pelican, at 120 px and at 240 px; a target out of reach even so gets the steepest-reaching lob (`atan(v²/(G·d))`) instead of the arrow's flat 45°. It throws only while fewer than `MAX_JBOMBS = 3` of its own bombs (`from === u`) are in the air, checked before it starts a throw. At the end of the draw it calls `battle.fireBomb(u, sol)`, which pushes a shot and emits `juggleToss {unit}`:

```js
{ kind: 'jbomb', team, x, y, vx, vy, r: 6, age: 0, bounced: false, fuseT: -1, from: u, dmgMul: u.dmgMul, X: type.bomb, ground: target.ground }
```

`ground` is the target's lane (the Juggler's own when it aims at a structure). `fuseT` is −1 in the air, then the seconds left before it bursts.

**Shots** (`towers.js` `updateShots`, which dispatches on `kind`, and `stepJBomb`). A `jbomb`:

- falls with gravity;
- **bursts on contact**, at the contact point, with any enemy body (`closestOnBody`, fliers included) or an enemy structure's rectangle;
- otherwise bounces once off the ground (×`bounce` up, ×0.75 along), rolls with its vx decaying as e^(−2.5 t), and bursts `fuse` s after the first ground touch, or at `maxAge`;
- a bomb whose numbers go non-finite is dropped without a blast.

**Burst.** `b.blastAt(x, y, X, team, dmgMul, null, { power: 0.5, small: true })`. Friends get the usual arena treatment (share `friendly`, soft shove). Bombs within half the radius light up (`chain`). Towers take `vsTower`.

**Fumbles** (scheduled with `battle.later`; the bombs are `jbomb` shots from chest height with `fuseT = delay`, `vx = ±rng·60`, `vy = −120`, `from: null`; `fumble` is emitted when they appear):

- **Knockdown, or grabbed by a Pelican or Jelly.** It drops `onDown` bomb at its hip x, at most once per `every` s (`u.fumbleT`). Emits `fumble {unit, n: 1}`.
- **Death.** It drops `onDeath` bombs within ±`spread` px. Emits `fumble {unit, n: 3}`.
- **Who gets hurt.** With `from: null` its own side takes the friendly share and the Juggler is not excluded: it fumbles on itself.

**Render-only juggling.** Three bombs orbit a figure-eight over its hands (period 0.9 s, `u.time`). One leaves the loop on each toss and a "fresh one" is pulled from its belt. While `act` is down or the unit is dead, nothing orbits. The fumbled bombs are real shots.

- **Physics beat.** The nervous grin while three fizzing bombs loop overhead. Lobbed bombs boing and roll. When a Clubber bonks it, the "uh-oh" face, one bomb on its own toes, BOOM. Kill it inside its own push and the push takes three in the face.
- **Job.** Splash support behind a tank. It shreds swarms (Sprouts, Spikers, Gang) and hits air (Propeller Pals, Pelican).
- **Counters.** Archers outrange it. The Anvil one-shots it (270 against 230). Brollies drop on it, and the Pelican lifts it (it fumbles). Kill it near its own push. Spikers dive it. It throws one bomb every 2.6–4.2 s (a 0.55 s draw, a 0.45 s recover, then its 2.0 s cooldown ×0.8–1.6), so a swarm that reaches it gets its hits in.
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
boingBox: { name: 'Boing Box', hp: 380, w: 46, h: 46, life: 28, arm: 1.0,
  punch: { reach: 90, band: 34, windup: 0.2, out: 0.08, hold: 0.06, back: 0.5, recharge: 1.0,
    damage: 50, launch: [380, 300], stun: 0.6, flip: 150, maxHits: 2 } },
```

**State** `t.punch = { phase: 'idle' | 'windup' | 'out' | 'hold' | 'back' | 'recharge', t, ext, dir }`. `t` is the seconds in the current phase, `ext` (0..1, 0 inside the box) the glove's extension, for the renderer.

**The glove.** Its centre rides at world y = −21 (`GLOVE_Y`), radius 10. At `ext` 0 it sits 6 px past the face; fully out its centre stops 16 px short of `reach`, so its front reaches `reach`.

1. **Idle.** When armed, it looks for an enemy ground unit (not `air`, not held) whose hip is within `reach` px of either face and within `band` of the glove's height (y = −21). A Pogo also counts when its stick tip is within `band` of it: a Pogo rides 14–50 px higher than a Clubber's hip, and the glove used to miss nearly every one. If one is found, it sets `t.f = dir` toward it, starts the windup (the lid rattles, 0.2 s) and emits `punchWindup {tower}`.
2. **Out** (0.08 s). The glove sweeps from the face to `reach`. It hits up to `maxHits` enemies whose body capsule the glove path crosses (sweep test: segment against capsule, glove radius 10, and for a Pogo also its stick, main hand to tip, radius 3), each once. Each hit:

   ```js
   takeHit(b, { damage: 50·dmgMul, dvx: dir·380, dvy: −300, stun: 0.6, kind: 'punch', shove: true, flip: 150, spin: 0.4 })
   ```

   That emits `hit` with kind `'punch'`. Heft scales the launch, so the Brick gets booped on the nose and barely moves. A lit Bomb punched back keeps burning and goes off among its friends.
3. **Back.** Hold, then the glove wobbles back on its spring ("boiyoioing"), then it recharges. A full cycle takes about 1.8 s. Emits `punch {tower, dir}` when the glove goes out.

- **Air.** It ignores air.
- **Who attacks it.** It is a structure, so everything that goes for structures attacks it. Melee beans walk right up to it, and that's the joke.
- **Physics beat.** Beans walk up to inspect a present… BOING, a cartwheel back into their friends like bowling pins. A Pogo punched clean out of the air.
- **Job.** A cheap reset against a single melee unit, a Pogo or Bombs. Bait for the Brick and the Pogo, held under your tower. It combos with Banana Peels: slip, slide into the box, punch.
- **Counters.** Ranged units outrange it (Archers, Juggler). Swarms (one punch per 1.8 s, at most 2 beans). Fliers. Spells (it takes 0.75: an Anvil takes 203 of its 380 hp). The Brick barely moves. `shoveT` makes back-to-back punches weak. Its glove (reach 90 from its face) outreaches every melee bean's swing (reach 32–80), so in a duel a lone Clubber pair or Bruiser never gets a swing in: it takes a push, a ranged unit or a spell. (In bot play melee decks are not hard-countered: the Box's side wins 41–52% against decks with Clubbers, a Clubber Gang or a Bruiser.)
- **Art.** A **team-colour gift box** with a big white bow on top. The glove is red (`#e0352b`) on a zig-zag silver spring. The lid lifts on the windup. Wilting with age: the bow droops. Footprint 46×46 is about 20 px on a phone, so keep the bow chunky.
- **Card art.** The glove mid-punch, a bean flying out of frame.

#### 24. Bean Patch (`beanPatch`): the spawner

```js
beanPatch: { id: 'beanPatch', name: 'Bean Patch', kind: 'building', building: 'beanPatch', mana: 3, rarity: 'rare', arena: 3,
  desc: 'Plant it and Sprouts pop out of the dirt, shake it off and charge.' },
```

```js
beanPatch: { name: 'Bean Patch', hp: 360, w: 64, h: 40, life: 24, arm: 1.0,
  spawn: { unit: 'sprout', every: 3.0, max: 3, vx: [120, 200], vy: [300, 380], deployT: 0.6 } },
```

**State** `t.spawn = { next, kids: [] }`. `next` is the seconds left to the next spawn try (a countdown: `arm` at placement, `every` after a pop, 0.5 after a blocked try). `kids` holds the ids of the live units this patch spawned: `removeUnit` prunes them, and the patch also counts which are still alive at each try (a Sprout's corpse lingers a few seconds before `removeUnit`).

- **Spawning.** First at arming (1.0 s after placement), then every `every` s, only while live kids < `max`. A blocked spawn retries 0.5 s later.
- **The spawn call.** `battle.spawn('sprout', team, t.x + f·w/3, { level: t.level, pop: [f·rng(vx), −rng(vy)], deployT: 0.6, from: t })`. When it executes it sets `u.spawnOf = t.id`, pushes to `t.spawn.kids` and emits `sproutPop {tower, unit}`.
- **Totals.** About 6–8 Sprouts over its life (fewer while capped).
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
anvil: { fall: 0.9, height: 620, damage: 270, shield: 0.4, stun: 1.2, squash: 1.0, carry: 900, liftOff: 1.2, rest: 2.0 },
```

The entity is `{ kind: 'anvil', team, f, x, y, vy, t, r: 18, state: 'fall' | 'rest', alpha, done }`. It falls straight down at x, timed to land at `t = fall`. The renderer draws a shadow that grows the whole time. Over a standing structure (a tower or a building, either side) it comes to rest on the roof, so it CLANGs a little before `t = fall` there; beans in its column are hit at any height either way.

**Impact.** Emits `anvilImpact {spell, power: 1.4, hits}`. Every enemy unit with `|e.hip.x − x| ≤ radius + e.R`, **at any height**, takes:

```js
takeHit(b, { damage: 270·dmgMul·(e.type.shield ? shield : 1), dvx: 0, dvy: e.air ? +carry : 60, stun: 1.2, kind: 'anvil', floor: true, spin: 0.2 })
```

- **Squash.** The hit floors (`floor: true`, 3.5): a survivor goes down whatever its poise (the Brick, Big Jelly, Nutcracker and Squire too), unless Bubble Wrap's stun ×0.5 keeps it up. Survivors that are down get `squashT = 1.0` and `downT = max(downT, 1.0)`: the renderer pancakes them, about their own feet, exactly while they lie there. A wrapped bean that stays up is neither floored nor squashed.
- **Fliers in the column** also get `liftOffT = 1.2`. They are slammed down with it.
- **Shields.** A Squire always gets its shield up in time (it sees the shadow): only 40% gets through (BONG).
- **Structures.** Towers take `270·0.5`, buildings `270·0.75` (135 and 203): three Anvils don't finish a 420 hp Guard Tower.
- **Afterwards.** The anvil rests for 2 s (cosmetic; not solid), then fades. Its floor is read again every step: when the structure under it goes (it finished it, or that one fell or decayed later) it drops on down under gravity to whatever is under it, quietly (no second CLANG).

- **Physics beat.** A whistle, a growing shadow, CLANG. A pancaked bean peels itself off the ground with an accordion squeak. A Propeller Pal or Pelican dragged out of the sky.
- **Job.** The big single-target answer. It kills the Juggler (230), Bruiser (250), Netter (250), Pogo (260) and Archers (64), but not a Drummer (280). It takes over a quarter off a Brick (950), two fifths off a Big Jelly (680), most of a Pelican's 320 hp, 203 of a Boing Box's 380 and of a Bean Patch's 360, and finishes towers and buildings.
- **Counters.** It is slow and visible (0.9 s), so fast units step out (Pogo, Spikers, charging Clubbers). Swarms make it a terrible trade. Shields. Bubble Wrap soaks 85.
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
  attack: { bite: true, windup: 0.45, hold: 0.12, strike: 0.12, recover: 0.5, cooldown: 0.6, damage: 120,
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
- **Hit test.** The nearest enemy (not `air`, not held) whose head or chest is within `biteR + e.R` of the jaw point takes `damage·dmgMul·(e.mass ≥ heavyMass ? vsHeavy : 1)`. Shields don't block (`shieldPierce 1`); skip the shield test. The hit has `knock 120`, `stun 0.6` (pushed `(f·knock·0.8, −knock·0.6)`), kind `'bite'`, and a squash kick on the victim (`sqv += 10`). Emits `hit` with kind `'bite'`.
- **Structures.** If no bean is hit and the jaw point is within 20 px of an enemy structure's face: `damageTower(b, t, damage·dmgMul·takesOf(t,'melee', vsTower), …, 'bite', u)`. Towers take ×0.5 ("ow, my teeth"); buildings take full. With no bean and no face in reach the bite is a miss: one bite per strike.
- **Lethal bites** spit the victim out spinning: launch `[260, 340]` (`BITE_SPIT` in `battle.js`), flip 220, spin 1.2.
- **The jaw.** The renderer reads `u.act.phase` and `u.act.t` for how open it is: open in windup and hold, a trembling hold, shut on strike.

- **Physics beat.** The victim's head squeezed between the jaws, googly eyes bulging, the hat popping off. A lethal bite spits it out spinning. The jaw chatters while it walks.
- **Job.** The tank- and armour-killer: Brick (5 bites of 192, about 8 s; less with tower help), Bruiser, Big Jelly, Shield Wall. It catches a Pogo that lands in front of it.
- **Counters.** Swarms (one slow bite per bean: Sprouts, Spikers, Clubber Gang). Air (Propeller Pals, Pelican). Kiting ranged (Archers, Juggler). Knockdowns that reset its long windup (Cheese Wheel, Boulder, Peels, Boing Box). The Anvil. The Wrecking Crane: its ball keeps a lone Nutcracker off the mast (0 bites in 16 duels; it dies at the Crane every time).
- **Art.** A **tall bean (1.2×)** with a **tall black shako** (`#1e1e28`), a gold plate (`#e8c04a`) and a red plume. Its biggest feature is a **big square white jaw and beard** (`#f2efe6`) that hinges open. The coat is team colour with gold buttons. The silhouette is the tall hat plus the square jaw.
- **Card art.** Jaw wide open, a nut (or a tiny Brick) in front.

#### 27. Wrecking Crane (`wreckingCrane`): LEGENDARY building

```js
wreckingCrane: { id: 'wreckingCrane', name: 'Wrecking Crane', kind: 'building', building: 'wreckingCrane', mana: 6, rarity: 'legendary', arena: 3,
  desc: 'A crane with a swinging wrecking ball. Beans that wander close go FAR.' },
```

```js
wreckingCrane: { name: 'Wrecking Crane', hp: 850, w: 36, h: 170, life: 36, arm: 1.0,
  pendulum: { pivotUp: 170, pivotFwd: 34, L: 125, r: 20, sense: 230, pump: 9, maxAng: 1.2, damp: 0.4,
    minHit: 260, damage: 90, vRef: 430, dmgRange: [0.6, 1.25], up: 320, carry: 1.1, stun: 1.0, hitLoss: 0.85 } },
```

**State** `t.ball = { ang, angV, x, y, vx, vy, px, py, hits: Set }`. The pivot is at `(t.x + f·pivotFwd, −pivotUp)`. The ball is at `pivot + L·(sin ang, cos ang)`; when it hangs straight down it is at about y = −45, chest height. It is a **deterministic 1-DOF pendulum** (an angle ODE, not a Verlet rope), stepped at 120 Hz:

```js
const enemyNear = any enemy unit (ground or air, not held) with |hip.x − pivotX| ≤ sense;
const swing = acos(cos(ang) − angV² / (2·G/L));            // how far it will swing out, from its energy
const push = enemyNear && swing < maxAng ? pump * Math.sign(angV || f) : 0;
angV += (-(G / L) * Math.sin(ang) + push) * dt;  angV *= Math.exp(-damp * dt);  ang += angV * dt;
```

It pumps while the swing's **amplitude** is below `maxAng`, not while `|ang| < maxAng`: with the latter, the pump (9 rad/s², about `G/L` = 9.2) added more energy per half swing than the damping took out, and the ball went over the top and looped. With the cap the top speed is 428–436 px/s. Hits are swept: the ball's segment this step is tested against each enemy capsule, radius `r + e.R`.

- **A hit needs** speed `v ≥ minHit`, an enemy not yet in `hits`, and the stroke that carries the bean **away from the mast** (ball vx pointing away from the mast on the bean's side). The back-swing toward the mast never hits: it would pin the beans at the mast's face against the wall. `hits` clears every time `angV` changes sign.
- **Each hit:**

  ```js
  takeHit(b, { damage: damage·dmgMul·clamp(v/vRef, dmgRange), dvx: vx·carry, dvy: vy·carry − up, stun: 1.0, kind: 'crane', shove: true, flip: 160, spin: 0.5 })
  ```

  After it, `angV *= hitLoss`: the ball loses energy into the bean. Emits `hit` with kind `'crane'`.
- **Swing event.** `craneSwing {tower, power}` once per pass through the bottom while `v ≥ minHit`.
- **What it ignores.** Its own team, and structures. The ball itself is not solid.
- **Swinging through the air.** It hits fliers it sweeps through; at big swings it reaches about 110 px up.
- **Destroyed.** The mast topples forward onto the field (render) and the ball drops as an item that rolls: `{ kind: 'craneBall', team, f, R, r: 20, a, b, con, age, life: 6 }`, two particles, mass 3 in all, bounce 0.2.

**The numbers in play.** About one or two victims per pass, then it has to pump back up (about 1–2 s). That is roughly 55–90 damage plus a big launch every couple of seconds on whoever stands at its face (90 at 430 px/s, scaled down to 0.6× at `minHit`). `shoveT` softens repeat hits. Ranged units outside 230 px never wake it up.

- **Physics beat.** The crane creaks, the ball winds up, and beans get golf-swung across the field in huge screaming arcs. The Brick takes the ball on the nose and just keeps hammering the post.
- **Job.** A fortress piece: it wrecks melee pushes and swarms that walk into it, and it pulls everything that hunts structures.
- **Counters.** Ranged units outside its reach (Archers at 230+, the Juggler at 200+: the ball swings out to about 150 px in front of the mast). Spells (Anvil, Boulder; it takes 0.75). The Brick (heft 0.3 shrugs off the ball, and its hp soaks it). Sprouts (each one eats a pass's energy). (Not the Nutcracker: the ball meets it before its bite reaches the mast.) It decays over 36 s.
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
  float: { height: 380, vMax: 122, sway: 18, landStun: 0.6 },   // (the canopy's cap settles the fall at ~vMax + 20 px/s)
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
- **Each substep while `floatT > 0`.** If the hip's downward speed is above `vMax`, every part gets `addVel(0, −(vy − vMax)·0.5)`; that cap settles the fall about 10–20 px/s above `vMax`, which is why `vMax` is 122 for a 2.6–2.8 s descent. The sway is a force on the hip toward a sideways velocity of `sway·sin(1.7·time)` px/s. Use pose `float`.
- **Landing.** When `groundF > 0.5`, set `floatT = 0` and `deployT = 0.4`, and emit `brollyLand {unit}`. The descent takes about 2.7 s.
- **Flip.** In `takeHit`, **any damaging hit while `floatT > 0`** sets `floatT = 0`, `flipped = true` and `deployT = 0` at once (it takes fall damage and the towers keep shooting), and emits `canopyFlip {unit}`. Only air-capable sources can reach a floater anyway: arrows, bolts, cannonballs, blasts and spells. It falls freely (`flipFall`: `think()` idles) and takes normal fall damage. On its first body contact with the ground it gets `downT = max(downT, landStun)` and `deployT = landStun + 0.4`.
- **While `floatT > 0`** it counts as **air** (3.2). Towers and Archers shoot it. It can't act (`deployT`).
- **The umbrella** (render): open while `floatT > 0`, inside out while `flipped` and still more than 14 px up, closed on the ground. Once flipped and landed it stays closed with two bent spokes poking out.

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
bubbleWrap: { time: 8, absorb: 85, stunMul: 0.5, bounce: 0.6 },
```

**Cast.** The entity `{ kind: 'wrap', team, x, y, t, radius, done }` is a 0.5 s puff for the renderer. At cast, every **own** unit (alive, not gone, ground or air, including ones still dropping) with `|hip.x − x| ≤ radius + R·0.5` gets:

- `wrapHp = wrapMax = absorb·levelMul(cardLevel)` and `wrapT = 8`;
- `wrap {unit}`, emitted for each one.

Recasting refreshes the wrap; it never stacks.

**In `takeHit`:**

- **Absorb.** If `wrapHp > 0`: `const a = min(wrapHp, damage); wrapHp −= a; damage −= a;`, and it emits `wrapPop {unit, left}` (only when something was absorbed; the renderer throttles it). The hit's voice uses the damage that got through.
- **Stun.** `stun ×= stunMul` when the bean is wrapped as the hit lands (judged before the absorb). Knockback is unchanged: wrapped beans still fly, which is the fun part.

**In `post()`:**

- **Landing.** While the wrap holds, there is no fall damage and the body particles' bounce is 0.6 (re-applied every step). Restore the original bounce (0.32 alive) when it ends.
- **End.** At `wrapT ≤ 0` or `wrapHp ≤ 0`, or when its bean dies, the wrap ends and emits `wrapEnd {unit, popped}`.

The cast only sets `wrapHp`, `wrapMax` and `wrapT` and emits `wrap`; `unit.js` does the rest.

- **Physics beat.** Every hit goes POP-POP-POP with little puffs. A wrapped bean flung by a Boulder bounces three times like a rubber ball and gets straight back up.
- **Job.** Protect a push from splash. It fully absorbs one Arrow Rain (63), most of a Boulder (95), about 8 tower bolts, a Big Sneeze (32) or a Soda (65). Cast it on Sprouts, Propeller Pals or a Clubber Gang just before their spell lands.
- **Counters.** Big single hits (the Anvil's 270, a Nutcracker bite). Waiting out the 8 s. The Pelican (a carry ignores it). Displacement: the knockback still lands. It does nothing on defence against one big unit.
- **Art.** A translucent sheet (`#dff4ff`, alpha 0.45) with a grid of round bubbles and white highlights hugging the body. Bubbles vanish as `wrapHp/wrapMax` drops; little white "pop" stars on hits.
- **Card art.** A wrapped bean mid-bounce over a dust puff.

#### 30. Tummy Drummer (`tummyDrummer`): the buff

```js
tummyDrummer: { id: 'tummyDrummer', name: 'Tummy Drummer', kind: 'unit', unit: 'drummer', count: 1, mana: 3, rarity: 'epic', arena: 4,
  desc: 'BOOM-BOOM! Friends nearby march and swing faster to the beat.' },   // (4 was too much for a bean that only drums)
```

```js
drummer: {
  id: 'drummer', name: 'Tummy Drummer', shape: 'bean', blurb: 'Keeps the beat. Everyone nearby speeds up.', cost: 100,
  hp: 280, radius: 15, bodyLen: 26, speed: 58, mass: 1.0, weapon: 'none',
  follow: { behind: 70, home: 80 },
  beat: { every: 0.5, radius: 150, time: 0.6 },          // the effect (+50%) is BEAT in unit-types.js
  poses: {
    rest: { main: [10, 0], off: [8, 2], ang: 0, lean: 0, crouch: 0, wk: 1 },
    beatA: { main: [12, 8], off: [8, -2], ang: 0, lean: 0.05, crouch: 1, wk: 1 },      // left mallet up
    beatB: { main: [10, -2], off: [10, 8], ang: 0, lean: 0.05, crouch: 1, wk: 1 },     // right mallet up
    cheer: { main: [6, 18], off: [-6, 18], ang: 0, lean: -0.05, crouch: 0, wk: 1 } },
},
export const BEAT = { tempo: 1.5, move: 1.5 };
```

**AI** (`think()`, `type.follow`):

- **Following.** The lead is the own unit (alive, not a follower, not held, ground or air: a flier or a floating Brolly can lead) furthest forward (max `f·hip.x`). The goal is `lead.hip.x − f·behind`.
- **Alone.** With no lead, the goal is its own Guard Tower x − f·`home` (or its Castle's, once the Guard Tower is down).
- **Moving.** It walks toward the goal (dead band 12 px) and **never attacks**. Its `target` stays null, so towers and enemies still treat it as a normal unit.

**Beat** (`battle.step`, before the AI loop, for each live drummer):

- Its own `beatClock` advances by dt (it wraps every `every` s; the renderer's drumhead flash reads it). Every `every` s, each friendly unit within `|dx| ≤ radius` (any height, itself included, never buildings) gets `beatT = max(beatT, time)`, and it emits `beat {unit}`.
- It keeps the beat only while it is up and in the fight (battle phase, `deployT` 0, not knocked down, not held); its `beatClock` pauses otherwise.
- The pose alternates `beatA`/`beatB` on each beat.
- Two Drummers don't stack: `tempo()` is a constant 1.5.

- **Physics beat.** Everyone nearby bobs and steps in time, pupils bouncing on the beat. Hits make the drum BONG. When it dies the drum rolls away ringing: a `'drum'` item, `{ kind: 'drum', team, f, R, a, b, con, age }` (bounce 0.45), a short stick drawn as a disc.
- **Job.** A push amplifier: the Clubber Gang, Bruiser and Brick wind up and recover 50% faster, about 1.4× as many swings (the strike itself keeps its time, so a heavy swing still lands, 3.5), and the Pogo and Sprouts get there sooner. It is the Parade deck's engine. Alone it does nothing.
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
  flying: { alt: 200, bob: 6 },                     // (high enough to clear a Guard Tower in every lane, bob and all)
  engage: 30, reach: 120,
  scoop: { sight: 320, maxMass: 1.0, swoop: 0.9, swoopAlt: 25, beak: 24, pinch: 20, carryAlt: 220, carryBack: 140,
    carryMax: 2.0, dropDamage: 40, dropStun: 0.4, cooldown: 3.5, letGoDamage: 60, letGoStun: 0.5 },
  dash: { kind: 'dive', windup: 0.4, climb: 20, speed: 420, time: 0.6, recover: 0.7, cooldown: 2.0,     // the peck
    damage: 30, launch: [160, 140], stun: 0.4, vsTower: 0.5 },
  poses: {
    rest: { main: [-6, 4], off: [-6, 4], ang: 0, lean: 1.1, crouch: 0, wk: 1 },     // nearly horizontal, wings back
    flap: { main: [-2, 16], off: [-2, 16], ang: 0, lean: 1.1, crouch: 0, wk: 1 },   // wings up (alternate at 3 Hz)
    windup: { main: [-8, 10], off: [-8, 10], ang: 0, lean: 0.6, crouch: 0, wk: 1 },
    dash: { main: [-10, -2], off: [-10, -2], ang: 0, lean: 1.5, crouch: 0, wk: 1 },
    cheer: { main: [0, 18], off: [0, 18], ang: 0, lean: 0.4, crouch: 0, wk: 1 } },
},
```

**Choosing a target** (at think rate, when the scoop is ready). It scoops the best liftable enemy ground bean (3.6) within `sight` along x, by `score = |dx| − 80·(class ranged or support, or the Netter)`, ties by id. A bean behind an enemy tower or building is swooped on only once the Pelican is over that structure (it keeps cruising while `towerBetween`; else it smacked into the wall and pecked the tower). With none and the scoop cooling down, it pecks the nearest ground unit or structure with the dive (`dash`, hit kind `'peck'`). It never targets air.

**The scoop** (act phases; the lift's damping is doubled in both, so it holds steady):

1. **`swoop`** (≤ `swoop` s). It flies at the victim's chest with a little lead, at up to 2.5× its speed, with `altWant = max(swoopAlt, the height where the beak meets the victim's chest)` (so it also reaches a tall bean, a Pogo on its stick). That puts it **below `AIR_MIN`: melee can hit it**. When the beak point (`head + fw·R`) is within `beak` px of the victim's chest, it grabs: `battle.hold(pelican, victim)`, `pinch` damage (`takeHit` kind `'pinch'`, dvy −60), and `scoop {unit, victim}`. A Bomb that gets grabbed is lit (`act = fuse`), and a Juggler fumbles. If there is no grab by the end, it climbs back up (recover).
2. **`carry`.** `altWant = carryAlt`, and it flies `carryBack` px toward **its own side** or for `carryMax` s, whichever comes first (and not before 0.6 s, to get up there); the goal never goes into its own Castle (clamped 30 px in front of it). Then `battle.letGo(victim, f·60, 40)` and `pelicanDrop {unit, victim}`. The victim gets `dropSlam = { damage: dropDamage·dmgMul, stun: dropStun }`, applied in `post()` if it falls faster than 320 px/s before it first touches the ground (3.5), on top of normal fall damage.
3. **Lets go early** (`letGo {unit, victim, why}`) when: hit by Big Sneeze; a hit whose stun, after poise and Bubble Wrap, is ≥ `letGoStun` (Soda, net, Anvil); a knockdown that ends the carry (`why: 'stun'`); `letGoDamage` taken in total during the carry; or death.

Cooldown `cooldown` s after a drop or a carry cut short. A swoop that grabs nothing (or is cut by a knockdown or a stunning hit) cools the scoop for half of it. A knockdown after the scoop is already over doesn't restart it.

- **Physics beat.** The swoop, a bean dangling by the chest from a huge beak with its legs running in the air, screaming. The drop. The splat. A Bomb in the beak turns it into a sooty, smoking mess that keeps flying, dazed.
- **Job.** An air picker. It pulls support out of pushes (Archers, Juggler, Drummer, Netter), lifts an attacker away and drops it into your tower's fire, and rips a Pogo off its path.
- **Counters.** Archers, towers, Arrow Rain, the Juggler, Big Sneeze (it drops its catch), the Soda, the Anvil. Heavy pushes (nothing to lift: Brick, Bruiser, Nutcracker, Big Jelly). Bombs as bait. Melee bonks during the swoop. The Netter, when it swoops low.
- **Art.** `bird` shape: a plump teardrop body along the hip→head axis, in **team colour with a white belly**, a **huge orange beak pouch** (`#f2a93b`) on the head, and the arms drawn as wings (white-tipped) that flap. Wingspan about 2.5 beans. A clear ground shadow. At cruise it flies at the height of a Guard Tower's HP bar, so a tower or building bar thins to 40% opacity (over about 0.1 s) while a flier, a floating Brolly or a bean in a beak covers it. A held bean is drawn over the bird's body but under its head and bill, the pouch stretched round it.
- **Card art.** The Pelican with a bean dangling from its beak.

#### 32. Big Jelly (`bigJelly`): LEGENDARY tank

```js
bigJelly: { id: 'bigJelly', name: 'Big Jelly', kind: 'unit', unit: 'jelly', count: 1, mana: 7, rarity: 'legendary', arena: 4,
  desc: 'A huge wobbly jelly that swallows small beans whole, then spits them out.' },   // (at 6 it was a must-have)
```

```js
jelly: {
  id: 'jelly', name: 'Big Jelly', shape: 'jelly', blurb: 'Swallows beans, spits them out. Wobbles.', cost: 260,
  hp: 680, radius: 28, bodyLen: 34, speed: 36, mass: 3.2, poise: 0.3, heft: 0.35, heftUp: 0.4, weapon: 'none',
  spine: 0.15,                                     // hip–head rod stiffness (default 0.22): a huge wobble
  body: { thigh: 14, shin: 14, upperArm: 9, foreArm: 9, standFrac: 0.9, chestFrac: 0.5 },
  engage: 24, reach: 30,
  engulf: { gap: 20, maxMass: 1.0, hold: 1.6, dps: 30, tick: 0.25, spit: [320, 380], spitStun: 1.0, cooldown: 1.5 },
  bump: { gap: 22, every: 1.6, damage: 30, knock: 300, stun: 0.5, vsStructure: 40 },   // (every 1.2 s knocked a Nutcracker out of every bite)
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
- **Spit.** After `hold` s it spits: `letGo(victim)` then `takeHit(victim, { damage: 0, dvx: f·320, dvy: −380, stun: 1.0, kind: 'spit', shove: true })`, and emits `spit {unit, victim}`. A bean that dies inside is popped out at `(f·160, −220)`.
- **Cooldown** `cooldown` s after **any** release (a spit, a Big Sneeze, the Sandbox hand of god), so a Sneeze really frees the bean.
- **Awake.** Engulf and bump need the Jelly awake (battle on, deployed, not down, `conscious > 0.5`); digesting and the spit run regardless.

**Bump** (independent timer). Every `every` s (×1/tempo), it bumps the nearest other enemy (not `air`, not held) within `gap` of its surface: `30·dmgMul`, knock 300 away, stun 0.5, kind `'bump'`, pose `bump` for 0.25 s. If there is no bean but a structure face is within `gap`: `damageTower(vsStructure·dmgMul·takesOf(t,'melee'))`. While it is hungry (nothing inside, engulf ready) it doesn't bump a liftable bean: the bump reaches 2 px further than the engulf and used to knock away the bean it was about to swallow. With nothing in reach the timer waits at 0 and bumps the moment something comes in; after a spit it restarts.

**Holding.** A held victim sits at the jelly's centre (3.6). The renderer draws it between the jelly's back and front layers.

- **Physics beat.** A bean doing slow-motion swimming inside the jelly, eyes wide. Arrows stuck *inside* it like fruit in a mould. The "PTOO" spit. The whole thing jiggling for a second after every hit (the soft spine and squash).
- **Job.** A control tank at the front of a big push. It soaks tower fire and eats the defenders' support one at a time.
- **Counters.** The Nutcracker (×1.6). Bombs (feed it one: ×1.6 inside). The Anvil. Swarms (it eats one at a time). Air (Propeller Pals, Pelican). Kiting ranged. It is slow (36): punish the other side of the field. It costs 7: the bot leads its pushes with it (section 8, `LEAD`), but a player who sees it coming has time to answer.
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
| Every number of the 14 | Unchanged through the balance passes: the golden replays (6.1) are bit-identical and were never re-recorded for a tuning | The new cards were tuned around them |
| Turtle style (`meta/opponents.js`) | Its 8th card, Cheese Wheel → Nutcracker | The first archetype table had no style that plays the Nutcracker, so bots never did. At Green Hills the Turtle deck is built exactly as before (neither card is unlocked there); until Brick Fortress the slot is topped up at random |
| Card details, "Targets" row | Uses the section 7 words for all 32 cards: "Beans & towers" → "Ground", or "Air & ground" for Archers and Arrow Rain; the Brick "Towers only" → "Buildings & towers" | One vocabulary for the air layer |

---

## 6. Engine features and interfaces

### 6.1 Phase 0 refactors (behaviour-preserving, gated by golden replays)

| Item | File (owner) | Contract |
| --- | --- | --- |
| Golden replays | `tests/battle-golden.test.js` (W1) | Six matches covering all 14 existing cards (the test asserts every one was played): three bot vs bot with fixed seeds, two scripted vs scripted, one scripted vs bot. They run to 120 s even after a castle falls. At t = 30, 60 and 120 s each writes one readable line: unit count, sums of hip x, hip y and hp (rounded to 1e-6), every tower's hp, crowns, cards played per side, and the total events plus an FNV-1a hash of the sorted event-type counts. **Recorded before any refactor** (re-recorded once at 6 decimals from a pristine `git archive` export of the untouched code: 3 decimals missed a 1e-6 damage change). `GOLDEN_PRINT=1` prints fresh lines for a deliberate re-record. They must stay identical through the whole project, unless a commit re-records them and says why (an intended tuning of an existing number). None was needed |
| `blastAt` | `battle.js` (W1) | `blastAt(cx, cy, X, team, dmgMul, from = null, opts = {})` holds the body of today's `explode()` loop. `X = { radius, damage, launch, friendly, chain, vsGiant, vsTower }`. It emits `explode {unit: from, power: opts.power ?? 1, team, radius: X.radius, small: !!opts.small}`. `explode(u)` keeps its "blown to bits" part, then calls `blastAt(u.chest.x, u.chest.y, u.type.blast, u.team, u.dmgMul, u)`. Keep the order of operations so replays stay identical. With `from = null`, nobody is excluded |
| `takesOf` | `towers.js` (W2) | `takesOf(t, kind, override)` (3.3) replaces every `TOWER_TAKES.x` read: in `battle.js` (W1: `resolveDash`, `meleeTower`, `quake`, `blastAt`, `stickInTower`), in `spells.js` (W2: boulder, rain, wheel) and in `bot.js` (spell and finish estimates). A building's table is `t.takes` |
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

`UNIT_ORDER` appends `'sprout', 'copter', 'pogo', 'netter', 'juggler', 'nutcracker', 'brolly', 'drummer', 'pelican', 'jelly'`. The new shapes are `'bird'` and `'jelly'`. Also exported: `SHOVE = { time: 1.6, knock: 0.25, stun: 0.3 }` (3.5), `MAX_JBOMBS = 3` (card 22) and `LIGHT_KNOCK = 2.25` (the lightweight rule, card 15; `type.light` is set only on the Sprout).

**`sim/unit.js` (W1).** Fields from 3.5. Getters `alt` and `air`. Methods `tempo()`, `moveMul()`, `holdPoint()`, `slip(b, peel)`, `lifting()`, `liftOff(b, t, from)` (max-stacks `liftOffT`, emits `liftOff`). `takeHit` honours `hit.floor` (3.5: the knockdown check ignores poise; set only by a slip and the Anvil). Exported `isFlier(u)` (a flier, or a Brolly still floating). Act phases are `'windup' | 'strike' | 'recover' | 'dash' | 'draw' | 'fuse'` plus the new `'swoop' | 'carry'` (the Juggler's toss runs `'draw'` → `'recover'`; `toss` is only its pose). The renderer may read `act.phase` and `act.t`, and also `beatClock` (the drumhead), `netImmuneT` (the net tangle, while it is above `attack.air.immune − 0.3`) and `bumpPoseT`. Other new unit fields: `crashed`, `fumbleT`, `flipFall`, `hopping`, `hopCool`, `hopLanded`, `beatClock`, `scoopT`, `engulfT`, `engulfCool`, `bumpT`.

**`sim/battle.js` (W1)**

New methods:

```js
addBuilding(bid, team, x, level)    // -> Tower; calls makeBuilding(...) from sim/buildings.js, pushes to towers, emits buildingPlaced
floatIn(u)                          // Brolly descent (addUnit opts.float)
spawn(typeId, team, x, opts) / later(fn) / pending
hold(holder, v) / letGo(v, dvx, dvy)
letGoOf(holder, why, dvx, dvy)      // lets go and emits letGo (Sneeze, early releases, deaths)
blastAt(cx, cy, X, team, dmgMul, from, opts)
fireBomb(u, sol)                    // pushes a jbomb shot; bombsInFlight(u), fumble(u, death)
resolveBite(u)
canTarget(u, e)                     // exported for the bot as well
liveCount(team)                     // live units of a side (MAX_LIVE)
```

Also exported: `liftable(e, maxMass)` (3.6). Constants that are not type fields: `BITE_SPIT = [260, 340]` (a lethal bite's spit) and `TOSS_ELEV = 1.35` (the steepest toss).

Changes to existing methods:

- `findArenaTarget`: `canTarget`, `targets: 'structures'`, `prefersAir`, and the nearest structure including buildings.
- `towerBetween` counts buildings.
- `separate`: skips held units and hopping Pogos; a lightweight's push on a heavier bean is scaled down (card 15) and it gives way itself.
- `resolveMelee` and `resolveDash`: air filters, the net payload, `vsTower`; a lightweight's knock (a hit or a shield block) is scaled by the same factor.
- `towerWalls`: ends with the new `unpinch()` while a building stands (3.3).
- `step`: the beat pass, the hold springs, and the pending queue at the end.

**`sim/buildings.js` (new, W2)**

```js
export const BUILDINGS = { boingBox, beanPatch, wreckingCrane };      // section 4
export const BUILDING_TAKES, MAX_BUILDINGS = 3, BUILD_SNAP = 80, BUILD_GAP = 12, LAND_T = 0.35;
export function makeBuilding(bid, team, x, level, id) -> Tower        // new Tower('building', team, x, level, id) + def/state
export function updateBuilding(b, t, dt)                              // landT, decay, arm, punch / spawn / pendulum
export function fitBuilding(b, team, bid, x) -> number | null
export function wreckBuilding(b, t)                                   // what falls off a fallen building: the crane's ball (an item)
export { takesOf }                                                    // re-exported from towers.js
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
- `updateTowers`: buildings call `updateBuilding` and skip shooting; wrecks are removed once `downT > WRECK_T` (3 s).
- `updateShots` dispatches `'cannon' | 'jbomb'` (the jbomb step is `stepJBomb`).
- `muzzle()` is never called for buildings.

**`sim/spells.js` (W2).** New `SPELLS` entries (section 4). `KIND` gains `bananaPeels → 'peels'`, `bigSneeze → 'sneeze'`, `shakenSoda → 'soda'`, `anvil → 'anvil'` and `bubbleWrap → 'wrap'`. There are `castSpell` branches and an `updateSpells` tick for each, plus `updatePeels(b, dt)`.

**Moving entities** expose `x, y, vx, vy` so `main.js` can interpolate them. These are falling anvils (and a resting one dropping off a structure it finished: `vy > 0`), `jbomb` shots and the Crane's `t.ball`. For body parts and items, `main.js` `lerpIn` moves each particle's last spot (`px, py`) by the same amount as its `x, y`, so `x − px`, the step's motion that the Sprout's leaves and the Pogo's BOING lines read as speed, stays what the sim made it at any point of the frame; `lerpOut` puts all four back exactly.

**`sim/match.js` (W2)**

- `canPlay`: the building rule (`WORLD.deploy`, `fitBuilding`) and the anywhere rule.
- `play` for buildings: `build(team, card, x, level)` calls `battle.addBuilding` at the fitted x, and the oldest crumbles above `MAX_BUILDINGS`. `cardPlayed` carries the fitted x.
- `formation` for buildings and anywhere cards (the nearest clear centre, 3.4), with `blockedSpans()` (where a deploy-anywhere bean may not land) and `clearSpot(x)` for one bean.
- `weakest` skips buildings.
- New `buildZone(team)`, which returns `WORLD.deploy[team]`.
- `deploy`: `float: true` for `anywhere` cards.
- Exports `ANYWHERE = [40, 1460]` and `ANYWHERE_CLEAR = 16`.

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
| `crash` | `{unit, power}` | unit.post | a dead or lift-less flier hits the ground (`power` = impact / 900, 0..1.5, like `land`) |
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

The `takeHit` kinds that come with the new cards (no event of their own; they show in `hit` where one is emitted): `'slip'`, `'sneeze'`, `'soda'`, `'anvil'`, `'punch'`, `'crane'`, `'bite'`, `'bump'`, `'stomp'`, `'net'`, `'pinch'` (the Pelican's grab), `'slam'` (a Pelican drop), `'engulf'` and `'spit'`. The renderer and `main.js` add no sim events: their words, sounds and hit-stops are listed in `main.js`.

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
- **Worst-case scenarios** in `battle/tools/balance-arena.mjs --only perf` (W6), against a busy 14-card baseline match:
  - two Bean Patches per side, plus Sprouts, plus a Clubber Gang;
  - Big Jelly, Drummer, Juggler and Bomb Squad against a Wrecking Crane and Peels;
  - two Propeller Pals per side, plus a Pelican, Brollies and Sneezes.

  Each scenario is mirrored on both sides and replays its plays on a timer (no bots); the towers get 20× health so no castle falls and the fight never stops. The tool prints the CPU-s of each simulated minute.
- **Targets.** About 2.2 CPU-s per simulated minute on average, and about 3.0 for the worst minute. If over, lower `MAX_LIVE` to 28 and the Patch `max` to 2 (not needed: section 13).
- **The perf test** (`tests/battle-perf.test.js`) is relative to the machine: after an 8 s warm-up each, each worst case's 60 s must stay within 1.5× the busy 14-card baseline (3.0 against about 2.0) and the three together within 1.1× on average (2.2 against about 2.0), with one re-measure before it fails.

---

## 7. Legendary rarity and the meta game (W5, plus W2 for `cards.js`)

**`sim/cards.js`**

```js
legendary: { id: 'legendary', name: 'Legendary', color: '#2fd3c4', dark: '#147a72', glow: '#c8fff8' },
```

Teal, never confused with rare's orange. Card frame (`render/cards.js`): teal with gold trim, jewels in the corners (where rares have studs and epics sparkles), a gold crown crest with a teal jewel on the top edge, and a frozen diagonal rainbow sheen in the cached face. `drawLegendarySheen(ctx, x, y, w, h, t, opts)` sweeps the sheen for 1.4 s of every 2 s. The hub draws it on every legendary face 40 px or wider that isn't locked or dimmed (`hub-kit` `cardCanvas` registers them, `tickSheens(t)` redraws them from `hub.tick` at 30 fps), so they all sweep in step: the Cards screen, the card detail, the chest reveal and summary, rewards, celebrations, the shop and the Trail.

**`meta/collection.js`** (index L−1 is the cost of L → L+1):

```js
UPGRADE_COPIES.legendary = [1, 1, 1, 2, 3, 5, 8, 12];
UPGRADE_GOLD.legendary   = [100, 300, 800, 2000, 4000, 8000, 15000, 25000];
```

King XP is unchanged. Matchmaking already mirrors your deck's levels card by card, so a low-level legendary is never a pay-to-win gap.

**`meta/chests.js`**

- **Big Chest.** It gets `legendary: 0.05`. The roll happens **only when at least one legendary is unlocked** (`pool.legendary.length > 0`: from Boom Ridge, arena 2, the Bomb Juggler), and it is drawn **right after `epicFlag`**. Below arena 2 no extra rng draw happens, so a Green Hills or Pointy Pass profile rolls exactly what it rolled in the 14-card game (tested with fixed seeds; only which card fills a stack differs, because the pools grew).
- **What it gives.** On a hit, the *last common stack* becomes **1 copy of one legendary**. If no common stack is left, the last non-epic stack does. This happens before the existing "a common stack carries the bulk" fix-up, so that fix-up then turns a spare rare back into the common: a Big Chest with a legendary still has its guaranteed rare and a common stack. A chest never holds more than 1 legendary copy (`MAX_LEGENDARY = 1`).
- **Small Chest.** `legendary: 0`.
- **Fallback.** `DOWN.legendary = 'epic'` is used only if the pool is somehow empty.
- **Odds shown.** `chestOdds()` enumerates the legendary flag with the rest (exact) and includes `odds.legendary` (5% or 0) and `pool.legendary`; it also returns `legendary`, the chest's own chance once one is unlocked, so the popup can say when legendaries start. The info popup shows "Legendary: 5% (Big Chest only, 1 copy)" on the Big Chest, "Legendary: Big Chest only (5%)" on the Small Chest, and "Legendary: 5% from Boom Ridge on" before the unlock.
- **The chest show.** A legendary gets a "LEGENDARY!" label, a flash, a vibration pattern, a bigger shake, teal rays and a rainbow ring, and a fanfare (`cardReveal` with `{ rarity: 'legendary' }`: the epic chime plus a brass flourish).

**`meta/shop.js`.** It gets `price.legendary = 1500` and `count.legendary = [1, 1]`. Once a legendary is unlocked, the third offer becomes a legendary on 8% of days (`SHOP.legendary = 0.08`). Draw that extra `rng.chance(0.08)` **only when `pool.legendary.length > 0`**, after every existing draw, so today's shop doesn't change for players in arenas 0–1. On a hit, `rng.int(1, 1)` and `rng.pick(pool.legendary)` replace the offer with `i = 2` (the third). `DOWN.legendary = 'epic'`. (`meta/ladder.js` `RARITY_DOWN` gains `legendary → 'epic'` too; no random-legendary reward exists.)

**The day of the update.** A shop day the 14-card game began keeps that game's stock until the day ends, so the offers bought and the gift claimed still mark the same cards. `profile.js` sets `p.shop.cards14` when it reads a save with a shop day and no `firsts` (only the 14-card game writes those), later loads keep it while the day is unchanged, and `shop.js` `stock()` then rolls from `CARD_ORDER.slice(0, 14)` alone (so no legendary draw either); `rollover()` starts the next day without it. (Re-rolled from the 32 cards, about 6 shop days in 10 showed a different card as Sold in the slot that was bought, a Legendary about 1 time in 20.)

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

The existing test ("every card of arena > 0 is on the Trail") is extended to arena 0 cards that aren't in `STARTER_DECK`. None of the old milestones' `at` values moved (tested), and a legendary's 4 copies reach level 4 for 1,200 gold.

**Saves** (`meta/profile.js`). This build writes `PROFILE_VERSION = 3` (the same shape as 2, under the same key); v1 and v2 saves still load. The version is what a window's `storage` handler compares (`main.js`: an older version in storage is overwritten with its own save, a newer or equal one is loaded), so a window still running the 14-card game, whose save drops every card id it doesn't know but keeps the Trail milestones marked claimed, can no longer overwrite a 32-card save in an open window. As a backstop for a save written while no 32-card window was open, every load (`main.js` `loadSave()`, at start-up and when another window's save is adopted) runs `ladder.js` `restoreTrailCards(p)`: a card from a claimed `cards` milestone that the profile lacks comes back as the milestone gave it (level 1 with n − 1 spare copies), its `firsts` sort is marked told, and no notice is queued. Levels bought since are not restored.

**`meta/opponents.js` ARCHETYPES** (five new styles; of the five original ones only Turtle changed, see below). These rules apply:

- Cards that aren't unlocked are skipped and topped up as today.
- **The arena gate.** Each newer style has an `arena` field, the arena of its first card (tested), and `archetypesFor(arena)` lists the styles a bot may pick there: a newer style waits for its first card. The five original styles have no `arena` field and stay pickable everywhere, as before (applied to them, the rule would leave Green Hills with only Swarm, because Bonk Rush, Siege, Big Boom and Turtle start with an arena 1–2 card). At Green Hills `archetypesFor(0)` is exactly the old list in the old order, so the same seed picks the same style. `makeOpponent` picks from it.
- **A newer style is wholly itself from its own arena on:** every card in its list is unlocked at or before its `arena` (tested), so `buildDeck` there returns the list itself; below it, `buildDeck` still tops up the locked slots.
- **Every archetype must hold at least one air answer** among `archers, arrowRain, netter, bombJuggler, bigSneeze, shakenSoda, anvil` (`AIR_ANSWERS` in `meta/collection.js`) at every arena where any flier is unlocked (tested in the lists and in 25 built decks per arena).
- **The hub's demo match** (`demoStyle(arena, rng)` in `ui/hub-kit.js`) picks, for each side, from the newest unlocked style(s) (the largest `arena` among `archetypesFor(arena)`) half the time and from the others otherwise, so the newer cards show up behind the menu. Green Hills, with no newer style, makes the very same pick as before and draws no extra number. Ladder opponents are untouched by this.

The lists as shipped. The balance polish rebuilt Hop Cycle, Fizz Pop and Fortress (the first lists lost to every original style, 25–38% in the deck matrix: Fortress had only two units, every Hop bean was under 260 hp, Fizz was three bomb or spell cards plus small units) and swapped one card each in Sky Circus and Jelly Parade. Each keeps its first card (its gate), the cards of its arena that define it, and an air answer.

| id | name | arena (gate) | cards (in order of preference) |
| --- | --- | --- | --- |
| `bonk` | Bonk Rush | any | bruiser, clubberGang, clubbers, spikers, squire, archers, arrowRain, boulder |
| `siege` | Siege | any | brick, archers, cheeseWheel, spikers, arrowRain, squire, bomb, boulder |
| `boom` | Big Boom | any | megaBomb, bombSquad, bomb, shieldWall, archers, arrowRain, spikers, boulder |
| `turtle` | Turtle | any | shieldWall, squire, archers, boulder, arrowRain, bruiser, clubbers, nutcracker (was cheeseWheel) |
| `swarm` | Swarm | any | spikers, clubbers, clubberGang, bombSquad, archers, arrowRain, cheeseWheel, bomb |
| `hop` | Hop Cycle | 1 | pogoBean, propellerPals, sprouts, spikers, clubberGang, archers, arrowRain, boulder |
| `fizz` | Fizz Pop | 2 | bombJuggler, shakenSoda, bigSneeze, clubberGang, spikers, clubbers, archers, squire |
| `fortress` | Fortress | 3 | wreckingCrane, boingBox, brick, anvil, archers, spikers, squire, arrowRain |
| `sky` | Sky Circus | 4 | pelican, propellerPals, brollyBrigade, archers, bombJuggler, bigSneeze, squire, arrowRain |
| `parade` | Jelly Parade | 4 | bigJelly, tummyDrummer, bubbleWrap, clubberGang, bombJuggler, archers, squire, boulder |

What changed in the newer lists, and why:

- **Hop Cycle** (was pogoBean, sprouts, bananaPeels, spikers, bomb, netter, archers, arrowRain): the Pogo and the Propeller Pals, Pointy Pass's "up and over" pair, with a 1-mana Sprout and 2-mana Spikers to cycle and a Clubber Gang to go with them.
- **Fizz Pop** (was … megaBomb, squire, propellerPals, sprouts, archers): all three Boom Ridge cards kept; the Mega Bomb, Propeller Pals and Sprouts made way for a front line.
- **Fortress** (was wreckingCrane, beanPatch, boingBox, brick, anvil, archers, bananaPeels, arrowRain): two buildings, the Brick and the Anvil kept; the Bean Patch and Banana Peels made way for Spikers and a Squire.
- **Sky Circus:** its Netter became Archers (with the other styles stronger it fell to 38%, and the Big Jelly ate it 88%).
- **Jelly Parade:** its Sprouts became a Squire, after the Jelly's hp came down.
- **Turtle:** its Cheese Wheel became the Nutcracker (section 5), so some bot plays the anti-tank card.

**Hats (wardrobe).**

- `profile.js` `UNIT_IDS` appends `'pogo', 'netter', 'juggler', 'brolly', 'drummer', 'jelly'`. Missing keys clean to `'none'`, so no migration is needed.
- The `noHat` types are `sprout` (leaves), `copter` (propeller cap), `nutcracker` (shako) and `pelican`. They are not in `UNIT_IDS`, the wardrobe skips them, and `addUnit` never gives them a hat.
- Hat seats: `jelly: 0.9` (see 6.1). The Brolly's hat sits on its head under the umbrella. The Pogo, Netter, Juggler and Drummer use the normal bean seat.
- `cosmetics.js` `HAT_UNITS` lists the six too, and every entry gains `plural` (the wardrobe's "Hat for your Big Jellies").

**UI** (`ui/hub-kit.js`, `ui/cards-screen.js`, `ui/hub.js`, `main.js`):

- **`cardKindLine`:** `'Building · lasts 28 s'` (the Boing Box; read from `BUILDINGS[card.building].life`), `'Unit card · flies'`, `'Unit card · lands anywhere'`, and spells as today.
- **`cardStats` rows:** every number is read from `UNIT_TYPES`, `BUILDINGS`, `SPELLS`, `TOWER_TAKES` and `BEAT` (a test patches every table number and checks each row follows). Buildings: Health, Lifetime, Punch or Swing damage and Reach (Box, Crane), or Spawns and At once (Patch), and Targets. Reach is how far in front of the building's face it still hits: the Box's `punch.reach` (90), and for the Crane how far its ball reaches while it is still fast enough to hit (`minHit`), `pivotFwd + L·sin θ + r − w/2` with `cos θ = cos(maxAng) + minHit²/(2·G·L)` (136; not its `sense` of 230, which is only where it wakes up and starts to pump; measured, Clubbers, Archers and Jugglers are hit out to 110–120 px from the face, a Bruiser to 150). Peels: Slip damage, Peels ×5, Lasts 8 s. Soda: Pops after 1.2 s. Wrap: Absorbs (× level), Lasts, Radius, Targets. Drummer: Beat "Friends ×1.5 faster" (from `BEAT`; "Friends swing ×a, walk ×b" if the two ever differ) and Range "Beat 150". The damage row is named per unit (Dive, Peck, Bite, Bomb, Bonk, Bump damage). Fliers show "Speed: Fast · flies", the Brolly Brigade "Units: ×3 · anywhere".
- **"Targets"** for all 32 cards: `'Air & ground'` (`hitsAir`, and the air-answer spells Arrow Rain, Big Sneeze, Shaken Soda and Anvil), `'Ground'`, `'Buildings & towers'` (`targets: 'structures'`: the Brick and the Pogo), `'Nothing (buffs friends)'` (the Drummer), `'Your own beans'` (Bubble Wrap), `'Ground & low fliers'` (the Wrecking Crane). The Netter reads "Air & ground" although it reaches only low fliers (`airReach`). The Wrecking Crane reads "Ground & low fliers": its ball hits whatever its swept path meets, Propeller Pals at cruise height included (3.2), but it sweeps no higher than about 145 px, so never a cruising Pelican; it is not on the deck list of air answers (`AIR_ANSWERS`), and "Air & ground" is kept for the cards on that list. Stat values may wrap onto a second line (the Drummer's "Nothing (buffs friends)" and the Crane's "Ground & low fliers" do at 844×390).
- **Card badges:** a small wing (flying), a brick (building) and a target (anywhere), drawn by `render/cards.js` in the art window's top-right corner.
- **"No air answer in this deck":** shown in the Collection header (where the cure is), once a flier is unlocked and the deck holds none of the air answers listed above; tapping it lists the air answers unlocked so far. (Under the deck it would be out of sight: at 667×375 the deck panel shows exactly its 8 cards.)
- **Locked cards** show their arena, as today.
- **Aim tips and refusals** (`render/spells.js` `aimCheck(m, team, i, wx)` and `aimTip(c)`, with `ZONE_SNAP = 40`; `main.js` `aim.check` and `aim.reason` call them): tapping a card says "Tap your side to build it" (buildings), "Tap anywhere: they float down" (the Brolly Brigade) or "Tap your own beans to wrap them" (Bubble Wrap); a refused building says "Build on your side" or "No room to build here". A tip shows only when the play would be refused (`aimTip` is '' whenever `aimCheck` says `ok`, which is exactly `canPlay`): a building that `fitBuilding` slides into your zone from just past the midline reads as in its zone, so the tip, the ghost and the play always agree. A building card lights your own half and marks the rest as blocked; the Brolly Brigade lights the field between the two Castles' field-side edges. The ghost is the building's footprint at its fitted spot (red at the finger with no legal spot), the Brollies' drop markers sit where `formation()` puts them, Banana Peels shows 5 peel icons, the Anvil a see-through anvil 150 px above its circle with a dashed drop line, and the Soda a see-through bottle in its circle.
- **One-time tips.** `profile.js` gains `firsts: { flier, building, legendary }` (`FIRSTS`, `firstsOf(card)`). `grant()` queues one `{ kind: 'first', card, what: [...] }` notice per newly owned card whose sort hasn't been told yet (a Pelican, the first of both a flier and a legendary, says both in one tip, e.g. "YOUR FIRST LEGENDARY!"). The hub shows these notices whenever its modal stack empties (after a chest show or a reward), not only at start-up. `migrate()` keeps the flags and marks a sort as told when the save already owns such a card, so old saves get no tip.
- **Arena celebration.** It lists all of the arena's new cards, smaller when there are 5–6 so its buttons stay on a 375 px screen; an arena with a Legendary gets a line saying where it comes from (Big Chests 5%, the shop some days). Its intro line is "New cards! In chests and the shop now, and on the Trophy Trail." ("A new card! …" for one). The legendary line says "X joins the Big Chests and the shop." for one name and "X and Y join …" for more (`hub-kit` `andList`, `legendWords`, `newCardsLine`, and `firstTipLines` for the one-time tips).
- **"How it's fair"** gains "Legendaries are earned too." Its chest hours and Trail copies are read from `CHESTS` and `TRAIL`.

**Badges** (W5, counted by W6 in `main.js` into `profile.stats`; the five stats are in `STATS`, so they start at 0): "Slip 'n' Slide" (`slips`, red beans slipping on peels: 25, 100 Jellybeans), "Home Run" (`homeRuns`, red fliers netted or clubbed down, each once: 10, 125 Jellybeans), "Air Mail" (`airMail`, beans dropped by your Pelican: 20, 150 Jellybeans), "Jelly Belly" (`jellySpits`, your Big Jelly's spits: 20, 150 Jellybeans), "Crane Game" (`craneLaunches`, your crane's hits on red beans: 30, 150 Jellybeans). A Juggler bomb counts toward `booms` but never toward Chain Reaction (three in one second is its everyday juggling).

---

## 8. Bot (`sim/bot.js`, W5)

Everything new is an exact no-op for the 14 original cards: old COUNTER rows gain an 8th value multiplied by an air share of 0, new score terms are `+ 0`, new steps act only when a new card is in hand and draw no random numbers otherwise, and every `rng` call keeps its order. The three bot-vs-bot golden replays are identical. The bot still never reads the other side's hand, queue or mana bar; of the new things it reads only what a person sees (buildings, spell entities on the field, its own peels), and a test checks that with every new kind on the field.

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

**The bot never answers fliers with a card whose air value is 0.** The rule applies to any threat that is at least half in the air (danger-weighted, `AIRY = 0.5`): then every card with air value 0 is skipped (units, buildings, Boulder, Cheese Wheel, Peels). In a mixed threat a ground card can still answer the ground part (its fit counts only the ground classes) and is placed against the ground lead. Our own beans that can't hit air offset only the ground share of a threat (`dv × (1 − air share)`). `airValue(id)` is exported: a spell's is 1 for Arrow Rain, Sneeze, Soda and Anvil, else 0; it is wider than the deck list of air answers (Bomb Squad, Mega Bomb and the Crane have small air values), so decks use the list.

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

**`LEAD`** (added in the balance polish) is `{ bigJelly: 1 }`: the front-liner a deck is built around. In step 6 (start a push) a bot of skill ≥ 0.35 with a LEAD card in hand leads its push with it, and while it can't pay for it yet it waits rather than starting a push with something smaller. (Before, the 7-mana Jelly was almost never affordable when the bot pushed at 6–6.5 mana, so in Jelly Parade it sat in hand all match: 0.4 plays a match, now 1.5.)

**View.** `view()` puts buildings in `V.buildings = { mine, theirs }` and keeps them out of `towers`; `front` is always a real tower. Threats and pushes count units only. Enemy buildings in our half don't exist (their zone is their own half). `threat(V, reach)` also returns `groundLead`, `airLead`, `air` (the share in the air), `highV` (Pelicans cruising above a Netter's `airReach`) and `aa` (the share that can shoot fliers). Our standing buildings near the lead count in `threat()`: its need drops by `{ boingBox: 1.2, beanPatch: 0.8, wreckingCrane: 2.5 }` × health share × ground share for each within 220 px of the lead.

**Placement** (`DEFEND_AT` and the new play rules):

| Card | Where / when |
| --- | --- |
| netter | `'under'`: at the lead flier's p (or the attackers' lead). A Pelican cruising above its `airReach` counts half for it |
| bombJuggler | `'back'`, like archers; as support `push.front − 120` |
| boingBox | `'front'`: `frontP + 68` (in front of our tower, inside its range) when melee + siege + bomb are ≥ 35% of the threat |
| beanPatch | `'front'`: `frontP + 77` when siege + tank are ≥ 35% of the threat; or proactively at ≥ 8 mana with no threat (`frontP + 100`) |
| wreckingCrane | `'front'`: `frontP + 70` when `threat.tv ≥ 5` and melee + swarm + tank are ≥ 50% of it |
| tummyDrummer | support only: `push.front − 90`, when push value ≥ 4 (+0.25 support score); as a last resort, a leak behind our tower when nothing else in hand can be played at full mana (it waits there for the next push) |
| pelican | defence against ranged or melee: played at `frontP − 60` (it flies to its targets); support: `push.front − 150` |
| bigJelly | tank: from the back (`backAt`) or at the bridge in double mana; it leads pushes (`LEAD`) |
| brollyBrigade | `anywhereAt(V)`, see below |
| propellerPals | defence only against a threat less than 20% of which can shoot fliers (`threat.aa`); support behind a push |
| sprouts | cheap leak and bait: `pickCheap` favours them (+0.1); defence in front of a Bomb or Bruiser |
| pogoBean | rush at the bridge when the foe has ≤ 3 counted mana (+0.35 on a punish) or as a late push (+0.6), never into a standing enemy building with more than 30% health; also a last-resort leak at the bridge |
| brick | −0.3 when choosing a push leader while an enemy building stands |

**Building spots.** The first draft's `frontP + 40 / 60 / 70` overlap the Guard Tower (half-width 32 + the building's half-width + `BUILD_GAP`), so a building goes at `max(offset, clear of the tower + 1 px)`: Box +68, Patch +77, Crane +70 (in front of a Castle: +121 / +130 / +116), then through `fitBuilding`. Placement noise is ×0.5 and re-fitted (back to the planned spot when the noisy one has no fit). No building when the ground lead is already 30 px past our front tower, or when 3 of ours stand and the oldest still has ≥ 30% health (a 4th would crumble a fresh one); −0.2 fit per building of ours within 150 px.

**Build ahead** (added: before it, the Crane sat in hand 87% of a match). A big ground push (worth ≥ 5, under 50% air) walking over on their half gets the building `buildingFor` accepts, in front of our tower (a Box only against ≥ 35% siege), when none of ours stands, at most one per 12 s. If it can't afford it yet, a careful bot keeps its mana for it (no support, drop, punish, Patch or push meanwhile). At the leak point, with nothing coming and none of ours standing, a building in hand goes down instead of spilling mana.

**Full mana with no unit in hand** (`leakSpare`, added: with a hand of only spells and buildings while one of its buildings stood, the bot sat on 10 mana for up to that building's whole life, 24 s). When step 8's leak finds no unit to play (`pickCheap` and `leakRest` come up empty), it plays, in order: a building, if nothing is coming, `roomToBuild` allows one (never a 4th over a fresh one) and `buildAt` finds a spot; else the cheapest spell that can hurt a tower (never Peels or Wrap) at `bestSpellSpot` when that is worth anything, else at their front Guard Tower (`spellAt`); else Banana Peels 90 px in front of its own front tower. Never Bubble Wrap. The 14 original cards always leave a unit in hand to leak, so they never get here.

**Saving up for air (`holdAir`).** Alarm on, a threat ≥ 50% in the air, nothing in hand that reaches it, and an air answer in its own deck: a careful bot (skill > 0.35, aggro < 0.5) skips support, Brolly drops, punishes, the proactive Patch and pushes until an answer turns up. Spells and leaks still run.

**`anywhereAt(V)`** (Brolly Brigade): score each enemy target, highest first.

1. An enemy tower at ≤ 25% hp: land 50 px in front of its face (step 1b, `'finish'`).
2. The most valuable enemy back line (archer, juggler, drummer, netter; the Netter counts though its class is melee) at least 200 px from enemy melee: land on it. Targets standing within an enemy tower's or building's footprint (±2R) are skipped: walls keep the Brollies off them.
3. An enemy building: land on its near side, worth card mana × health share × `{ beanPatch: 1, boingBox: 0.7, wreckingCrane: 0.4 }` (a Crane swings at whoever lands by it).

A drop needs a target worth ≥ 2.5 mana, at most one every 5 s. On defence (its COUNTER row) it lands on the threat's back line when one is clear, else where a defender goes. Otherwise it doesn't play the card; never as a push, as support or as a cheap leak. It applies the normal placement noise ×0.7, clamped to `ANYWHERE`.

**Spells** (`spellDamage`, `spellDelay`, `bestSpellSpot`, `finishable`; the damage is read from `SPELLS`):

| Spell | Damage per bean (before level) | Delay | How it is valued and aimed |
| --- | --- | --- | --- |
| bananaPeels | 8 (stall) | 0.4 | **Defence only**, on the threat group in our half (from defence and from the cluster-spell step). Value = 0.35 mana per expected slip: a walker (not heavy, ranged, air or held) that will cross the whole circle counts 2 slips, one standing in it now 1, capped at `maxSlips`. Cast at `threat.lead − vp·0.6` (in front of them), clamped inside our tower's range (≤ `frontP + range − R/2`). Never where 3 or more of our live peels already lie |
| bigSneeze | 32 | 0.4 | What it blows back from within 220 px of our front tower is worth 0.6 × worth × min(1, heft) (air ×1; heavies barely move); a bean its 32 × level kills counts its full worth; +2 per held bean of ours it frees. The rescue is step 0 (before finishing towers): our bean worth ≥ 1 held by a noticed enemy holder, cast at the holder's x 0.4 s ahead (`'rescue'`) |
| shakenSoda | 85 (65 + fall) | 1.2 | 85 against beans, 65 against towers and buildings. Cluster value with heavies (mass ≥ 3) at ×0.3; aim at where the push will be in 1.2 s, so it is cast ahead of a push |
| anvil | 270 | 0.9 | The best **single** spot: each enemy's predicted spot and each enemy building, worth × kill share, ×0.5 for a target moving faster than 70 px/s. Enemy buildings count as `card mana × the hp share it takes`. Finisher: `270 × 0.5 × lvl`. Aimed with half the spell noise (0.25 instead of 0.5: with 0.5 its 34 px column missed about 20% of casts) |
| bubbleWrap | – | – | **Own push** (`'wrap'`). Cast during step 4 (support) when our push value ≥ 5 is within 260 px of enemies or inside their front tower's range and at least 3 of our units not already more than half wrapped fit the circle. At most once per push (10 s). Also at once on a bunch of ours (≥ 2, worth ≥ 2.5) under an enemy spell still coming down (a falling Boulder, an Arrow Rain before its last volley, a fizzing Soda, an inhaling Sneeze): it sees the entity as a person sees the rock. A wrap doesn't hold back the bot's next damage spell |

Non-air spells (Boulder, Cheese Wheel, Peels) value fliers, and Brollies still floating high when the spell lands, at 0. Finishing and overtime chipping never use Peels or Wrap. `takesOf(t, 'spell')` is used wherever a spell's damage to a tower or building is estimated.

**Fliers in threats.** `threat()` counts fliers. `pickDefence` scores only cards with an air value > 0 against the `air` share. With no answer in hand it saves up (`holdAir`, above).

**Logs and stats.** `bot.log` entries for `'defend'` carry `air` (the threat's air share). New `why` values and `stats` keys: `rescue`, `wrap`, `drop`, `build`, `ahead`. `BOT_TUNING`'s keys are unchanged; the new knobs are module constants at the top of `bot.js`.

**Random decks in the balance tool** (W6) must include at least one air answer (the same list, `AIR_ANSWERS` from `meta/collection.js`), so balance numbers aren't skewed by decks that can't play the air game. A random deck draws 1–3 spells and the rest from units and buildings together; with no air answer, a random card of the same kind (spell or not) is swapped for a random answer.

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
| W1 | **Golden replays** identical. **Air:** a copter holds alt 100 ± 10 for 10 s with all values finite; a Clubber under it never damages it at cruise; an Archer and a Guard Tower do; a dead copter is on the ground within 2 s; `separate` never pushes a flier against a ground bean. **Dive:** hits a Clubber within 3 s; while `alt < 60` a Clubber can hit it. **Net:** within 1 s the copter is within 20 px of the ground; no second `liftOff` within 3 s. **Pogo:** crosses a line of 3 standing enemy Clubbers within 4 s, always targets a structure, bonks a tower, remounts after a knockdown. **Juggler:** a bomb bursts within 2.5 s and can kill a copter; a knockdown makes exactly 1 fumble, death makes 3. **Nutcracker:** a bite on a Brick deals ×1.6 and ignores the shield. **Drummer:** a Clubber's swing cycle is ×1/`BEAT.tempo` (1/1.5) inside 150 px and it walks ×`BEAT.move`; two Drummers don't stack. **Pelican:** grabs an Archer, carries it ≥ 100 px toward its own side and drops it; never grabs a Brick, Bruiser or Jelly; a Sneeze releases it; a grabbed Bomb lights. **Jelly:** engulfs a Clubber, holds it `engulf.hold` (1.6) ± 0.1 s, spits; never engulfs a Bruiser; an engulfed Bomb hurts it ×1.6. **Brolly:** descent 2.4–3.0 s; an arrow flips it and it lands within 1 s; towers target it while floating. **Wrap:** absorbs `absorb` (85), halves stun, no fall damage. **Shove:** a repeat within 1.6 s is ×0.25. **Spawn:** the queue keeps `units` sorted and no unit is visited twice in a step (instrumented counter). **Determinism:** the same seed and plays with all new cards give the same hash |
| W2 | **Card contract:** 32 cards, CARD_ORDER, 2/3/3/5/5 new per arena, rarity counts, legendaries never in arenas 0–1, every desc ≤ 80 characters, every `unit`/`spell`/`building` reference exists, no banned words (the list from the brief) in any name. **Buildings:** never give crowns; `weakest()` ignores them; decay reaches 0 at `life` ± 0.1 s; enemies can't walk through and own units can; the Brick targets a nearer building; the Box punches a Clubber ≥ 80 px back and a second punch within 1.6 s is weak; the Patch never has > 3 live Sprouts and spawns 5–8 in its life; the Crane launches an enemy that walks in and never hurts its own side; a Castle falling crumbles its buildings; a 4th building crumbles the oldest; placement is legal only in its own deploy zone (never the pocket) and never overlapping. **Spells:** Peels trip a walking Clubber within 2 s, heavies skid, immunity holds, at most 10 slips, a blast flings a peel; Sneeze moves enemies only and fliers further; Soda erupts at 1.2 s; the Anvil kills a Bruiser and brings a copter down; Wrap touches only its own team. **Match:** the `canPlay` rules for buildings and anywhere; the formation nudges |
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

**Balance runs** (`node battle/tools/balance-arena.mjs --n 24`, then `--n 40` for the final numbers). The "At ship" column is the final measurement (section 13 has the tables): the card numbers pool two `--n 40` card tables (seeds 1 and 3, 960 matches, about ±5% per card), the decks a 40-matches-a-pair matrix of all eleven decks.

| Measure | Target | At ship |
| --- | --- | --- |
| Each new card's win rate with/without (random legal decks with an air answer, equal skill 0.6, equal levels) | **40–60%** | **Met:** 43–60% |
| Each legendary's with/without | **45–55%** (a side-grade, never a must-have; over 55% is nerfed first) | Juggler 51%, Pelican 55%, Jelly 54%; **the Crane 43%** (45% on four seeds, 47% before the review fixes): at or just under the band |
| Any new archetype deck against any other deck (DECKS + archetypes) | ≤ 60% | **Not met** in single cells (worst: Jelly Parade vs Fizz Pop 83%); each newer style averages 45–53% against the other ten |
| **Any single matchup** | **≤ 65%** | **Not met:** 10 cells with a newer style above 65% (68–83%), and 5 among the original styles |
| Existing cards' with/without after the 18 arrive | still 40–62% (today 42–61%) | 43–58%, except Archers at 64% (they hit air now) and the Bomb at 39% (40% on four seeds); original cards, so left alone |
| Match shape at equal skill | about 20–30% end by castle, ≤ 25% tiebreak (today about 23% / 21%) | **Met:** 20% castle, 20% tiebreak (random decks) |
| +1 card level | still wins about 90–97% (today about 95%) | **Met:** 91% (level 2 vs 1), 93% (6 vs 5) |
| Newbie section (a player who only drags units) | still loses clearly to skill 0.3 (no card that "plays itself") | Already false with the 14 original cards: with starter decks the newbie beats a 0.3 bot 73% of the time. With random 32-card decks it wins 57%, so no new card plays itself. It still beats the Training Dummy 99% |
| CPU | ≤ 2.2 CPU-s per simulated minute on average over the cards section; worst-case perf scenarios ≤ 3.0 for the peak minute | **Met:** 0.21 on average; worst perf minute 1.75 (the air scenario), the busy 14-card baseline 1.80 |
| Brick after its retarget | ≥ 40% with/without (it now has building counters) | **Met:** 48% |

**Tuning knobs, in this order** (the first numbers to move), and what moved at ship:

| Card | Knobs | What moved |
| --- | --- | --- |
| Pogo | `bonk.damage`, `hop.vx`, `hp` | nothing (47%) |
| Pelican | `scoop.cooldown`, `carryMax`, `dropDamage` | `dash.damage` 40 → 30 (the peck). `scoop.cooldown` 4 changed nothing measurable and starved a bot test; `carryMax` 1.5 and `dropDamage` 25 didn't help |
| Big Jelly | `hp`, `engulf.hold`, mana (6 → 7) | `hp` 900 → 680, `engulf.hold` 2.2 → 1.6, `mana` 6 → 7, and `bump.every` 1.2 → 1.6 (its bump knocked its listed counter, the Nutcracker, out of every bite) |
| Wrecking Crane | `pump`, `hitLoss`, `damage`, `life` | `hp` 700 → 850, `pendulum.damage` 60 → 90, `pendulum.hitLoss` 0.75 → 0.85, `life` 28 → 36, `pendulum.sense` 190 → 230; `pump` stayed 9. Single knobs each read 41–45%: only life, damage and sense together moved it |
| Bubble Wrap | `absorb` (70 → 50) | `absorb` 70 → 85 (it was weak, not strong) |
| Banana Peels | `maxSlips`, `life` | nothing (42%) |
| Big Sneeze | `push`, mana (2 → 3) | `damage` 20 → 32, `push` 420 → 500; mana stayed 2 |
| Juggler | `bomb.damage`, `cooldown` | `attack.cooldown` 0.6 → 2.0, `bomb.damage` 60 → 40, `hp` 280 → 230. Damage alone did nothing: every bomb that lands floors its target, so the rate of fire is its power |
| Boing Box | `recharge`, `launch` | `hp` 320 → 380, `life` 25 → 28, `punch.damage` 40 → 50; `punch.recharge` stayed 1.0 (faster strengthens the melee lock) |
| Bean Patch | `every`, `max` | `spawn.every` 3.4 → 3.0, `mana` 4 → 3 (bigger spawns all read 42–45% and made 8–11 Sprouts a patch) |
| Drummer | `BEAT` (1.3 → 1.25) | `BEAT` 1.3 → 1.5 (it was the weakest card, so up, not down), `hp` 240 → 280, `mana` 4 → 3 |
| Propeller Pals | `hp`, `dash.damage` | `hp` 60 → 50, `dash.damage` 22 → 20 |
| Not on the list | | Netter `hp` 230 → 250, `attack.damage` 30 → 42, `attack.cooldown` 0.5 → 0.35; Nutcracker `attack.windup` 0.55 → 0.45, `attack.damage` 110 → 120; Shaken Soda `damage` 50 → 65; Anvil `damage` 310 → 270 (after the review fixes floored its survivors it read 61.5%) |

---

## 11. Open risks and fallbacks

| # | Risk | Mitigation and fallback |
| --- | --- | --- |
| 1 | **The air layer's feel and stability.** The lift spring at 120 Hz with 4 constraint iterations, the dive, the swoop, and two ragdolls tethered in a carry | Use the clamped lift (3.2) and the proven hand-of-god spring constants. Test early with W1's flight tests. Fallback for the copter: replace the dive with an acorn drop (an arrow variant) and keep the rest. Fallback for the Pelican: no carry; the scoop flings the bean up and back at once ("swoop and toss") |
| 2 | **Pogo hop locomotion** through walls, peels, knockbacks and crowds | Fallback: it walks fast (speed 100) and hops only when a bean blocks it within 60 px; everything else stays |
| 3 | **The bot can't play the new kinds well** (buildings, anywhere, fliers, own-side spells), and balance numbers hinge on that | Scripted bot tests per kind (section 9). Balance reports should be read per bot `stats` (how often each card was played and why). If the bot misplays a card badly, fix the bot before the numbers |
| 4 | **The Wrecking Crane becomes a fortress**, or is useless | Energy loss per hit, `shoveT`, a 230 px sense range, decay over 36 s. Fallback: a fixed amplitude (no pumping) and one victim per pass. Hard fallback: swap the card for a simpler legendary building with the same slot, rarity and arena |
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

---

## 13. As shipped

The sections above describe the game as shipped. This section is the list of what changed against the first design (the spec's starting values and wording), one line each with the reason, followed by the measured balance. Nothing here changed a rule's intent, a field name, an event or file ownership, and no number of the 14 original cards moved (the golden replays are identical and were never re-recorded for a tuning).

### 13.1 Numbers

| Card | Change | Why |
| --- | --- | --- |
| Propeller Pals | `hp` 60 → 50, `dash.damage` 22 → 20 (the dive) | 59–64% with/without; one Arrow Rain (63) still takes all three |
| Pogo Bean | rest and cheer hands at y −17 (was −14) | so the stick's tip touches the dirt when it stands (gap 0.1 px) |
| Butterfly Netter | `hp` 230 → 250, `attack.damage` 30 → 42, `attack.cooldown` 0.5 → 0.35 | 34%: most fights have no fliers, so it has to hold its own on the ground |
| Big Sneeze | `damage` 20 → 32, `push` 420 → 500 | it drifted to 41–47% as other cards changed |
| Shaken Soda | `damage` 50 → 65 | about 44% |
| Bomb Juggler | `attack.maxSpeed` 560 → 700, tosses up to 1.35 rad | with 560 and the arrow's 0.85 rad cap no lob rose more than 110–130 px over its hand: it never hit a Pal at cruise or a Pelican (0 damage in 4 × 8 s), though the card says it hits air |
| Bomb Juggler | `attack.cooldown` 0.6 → 2.0, `bomb.damage` 60 → 40, `hp` 280 → 230 | 84%. Damage alone did nothing (45 still read 85%): every bomb that lands floors its target, so the rate of fire is its power |
| Boing Box | `hp` 320 → 380, `life` 25 → 28, `punch.damage` 40 → 50 | about 42% |
| Bean Patch | `spawn.every` 3.4 → 3.0, card `mana` 4 → 3 | it slid to 38–42% as Sneeze and Soda got stronger; bigger spawns (max 4–5, every 2.2–2.6, life 30–32) read no better and made 8–11 Sprouts a patch |
| Nutcracker | `attack.windup` 0.55 → 0.45, `attack.damage` 110 → 120 | 40% |
| Wrecking Crane | `hp` 700 → 850, `pendulum.damage` 60 → 90, `pendulum.hitLoss` 0.75 → 0.85, `life` 28 → 36, `pendulum.sense` 190 → 230 | 41–44%; single knobs each read 41–45%, only life, damage and sense together moved it (47%) |
| Brolly Brigade | `float.vMax` 140 → 122 | the drag cap settles the fall 10–20 px/s above `vMax`: 140 gave 2.3–2.5 s descents, 122 gives the intended 2.6–2.8 s |
| Bubble Wrap | `absorb` 70 → 85 | about 43% (the spec expected to lower it) |
| Tummy Drummer | `BEAT` 1.3/1.3 → 1.5/1.5, `hp` 240 → 280, card `mana` 4 → 3 | 37%, the weakest card (the spec expected a nerf to 1.25) |
| Pelican | `flying.alt` 160 → 200 | at 160 its feet dipped below a Guard Tower's roof in every lane (the first sum left out the lane depth and the bob), so it bounced off every tower |
| Pelican | peck `dash.damage` 40 → 30 | 56–57% after the other changes (legendary cap 55%); peck 28 read 50%, hp 280 53%, `dropDamage` 25 55%, `carryMax` 1.5 58% |
| Big Jelly | card `mana` 6 → 7, `hp` 900 → 680, `engulf.hold` 2.2 → 1.6, `bump.every` 1.2 → 1.6 | 71%. The bump every 1.2 s knocked its listed counter, the Nutcracker, out of every bite; hp and hold moved it 2–4 points each, so it took the third knob, mana. Then the bot's `LEAD` rule made it 56–58% and hp came down again |
| Anvil | `damage` 310 → 270 | once its survivors were floored (13.2) it read 61.5% on two seeds, and three Anvils finished a 420 hp Guard Tower; 290 read 62%, 260 55%, 270 56–59% on three seeds (58% pooled). It no longer kills a Drummer (280) |
| The newer 18 | average mana 3.67 → 3.61, range 1–6 → 1–7 | from the three mana changes |

### 13.2 Rules settled during the build

**Sim: air, holding and the new units**

- **Fliers with no lift idle in `think()`** (3.2): a netted Pal used to "walk" along the dirt and dive from the ground.
- **The dive** aims with lead and gravity, emits `dive`, hits as `'dive'` / `'peck'`, rebounds off towers too, and takes no fall damage (card 17): the spec gave only "toward the head".
- **A played flier stops `dropping` below 30 px/s** and its first hard landing is a `crash`, not a `land` (3.2): it never lands.
- **While net-immune a net hit on a flier is only the ground swat** (card 19): read with 3.5 ("only the ground payload"), so a flier can't be kept floored.
- **The Netter's air scoop sweeps past non-fliers** (card 19): a bean under the flier used to end the swing, so a Netter in a brawl caught nothing.
- **Juggler fumbles and bombs pinned** (card 22): bombs from chest height, at its hip x or within ±`spread`; the 3-in-flight cap counts only its own throws; a jbomb bounces ×0.4 up, ×0.75 along, then rolls.
- **The lethal bite's spit is `BITE_SPIT` in `battle.js`; one bite per strike** (card 26).
- **`dropSlam` is judged on fall speed before the first touch** (3.5, card 31): a conscious bean lands on its feet and its legs soften body impacts to about 150 px/s, so "impact > 320" never fired, even from 220 px.
- **Bubble Wrap details** (card 29): the stun ×0.5 is judged before the absorb, `wrapPop` only when something was absorbed, the wrap ends when its bean dies, the bounce is re-applied every step.
- **Slip immunity starts at the slip** (`downT + immune`), and a heavy's skid sets it too (card 16): else a Brick on a peel skidded every step.
- **The Pelican's swoop reaches tall beans, waits until it is over a structure, and a carry ends at `carryBack` or `carryMax`, never inside its own Castle** (card 31): it used to smack into walls and peck the tower instead.
- **A Pelican miss cools the scoop for half its cooldown; early releases are judged on the stun after poise and wrap** (card 31): the spec named only the cooldown after a drop.
- **Walls skip a held bean** (3.6): the wall pinned a catch while the beak pulled it (parts up to 3,900 px/s).
- **The Jelly's bump spares the bean it is about to swallow, any release starts its engulf cooldown, and it engulfs and bumps only while awake** (card 32): the bump reached 2 px further than the engulf, and a Sneeze freed nothing when it re-swallowed a step later.
- **The Drummer beats only while it is up and in the fight; its lead may be a flier** (card 30).
- **The beat speeds every phase of a swing but the strike** (3.5, card 30): swept 1.5× faster, the Brick's hammer and the Bruiser's club passed through their target between two substeps, so the "swing faster" buff cut their damage by 75–80% (a Brick with a Drummer landed 0 hammer blows on a Guard Tower). Now a Brick with a Drummer takes the tower down.
- **A peel's slip and the Anvil floor whatever the poise (`hit.floor`)** (3.5, cards 16 and 25): `takeHit` scaled their stun by poise, under the knockdown line, so the Squire, Shield Wall, Bruiser, Nutcracker and Pogo never fell on a peel, and every ground survivor of an Anvil (all of them have poise) walked and fought on while drawn as a pancake. Survivors are now down at least `squash` (1.0 s), and only a down bean is squashed.
- **The Sprout is a lightweight (`type.light`, `LIGHT_KNOCK = 2.25`)** (card 15): two Sprouts shoved a walking Brick 100–150 px back up the field (the closing-speed bleed in `separate()` ignored mass), so the Brick, the Bean Patch's listed counter, did 0 damage to it. Now the Brick walks through and bashes the Patch (150–210 damage where it did 0).
- **The Brolly's sway is a velocity target; a flip sets `deployT` 0 at once and the landing sets `downT = max(downT, landStun)`** (card 28).
- **The Pogo's `groundF` comes from the hip, a boing sets (not adds) velocity, it edges in at a structure, and `separate()` skips it for the whole hop** (card 18): a stick flopped by a knockdown faked touchdowns, and landings varied every hop.

**Sim: buildings, spells and match rules**

- **`takesOf` reads `t.takes`** (3.3): no `towers.js` ↔ `buildings.js` import cycle; same object.
- **`fitBuilding` tries x + d before x − d** (3.3): the spec said only "outward".
- **The Crane pumps while its swing's amplitude is below `maxAng`** (card 27): with `|ang| < maxAng` the ball went over the top and looped.
- **The Crane hits only on the stroke that carries a bean away from the mast** (card 27): the back-swing pinned beans at the mast against its wall.
- **Banana Peels trip beans "on their feet" (hips within 10 px of standing)** (card 16): `groundF > 0.8` shut out the Sprout (about 0.75 at a run) and the Big Jelly (about 0.55).
- **A heavy's skid uses up the peel like a slip; peel items carry `dmgMul` and `spell`** (card 16).
- **The Anvil comes to rest on the roof of a structure under it** (card 25), so it CLANGs a little early there: the spec always landed it on the ground at `t = fall`.
- **`buildingLand` pops beans touching the footprint, not only inside it** (3.3): the walls have already pushed them out by the time the crate lands.
- **Wrecks are removed by `updateTowers`, not `reap()`; decay and work stop when the match ends; the Patch counts its live kids itself** (3.3, card 24).
- **The Boing Box glove's geometry is pinned (y −21, r 10), and it tests the Pogo's stick** (card 23): the glove missed nearly every Pogo (2 hits in 18 punches while the Pogo bonked the box 34 times over 5 seeds); now 2 hits on every seed and the box survives. Box and Pogo re-measured 46% and 47%: nothing retuned.
- **Brolly formation: the nearest clear centre** (3.4): beans nudged one by one all landed on the same edge, three umbrellas on one spot; slid as a block, the group could swing between two structures closer than a bean is wide and still stack, or land inside a footprint (in a scan of every aim, 90–450 stacked aims per layout of structures). The centre is now searched exactly, and `clearSpot` merges overlapping spans.
- **`Battle.unpinch()`** (3.3): `BUILD_GAP` (12 px) is narrower than any bean, so a building played on enemies at your tower pinned them half inside the tower (up to 8 s; the last wall in `battle.towers` won every step). `BUILD_GAP` stays 12.
- **A resting Anvil drops when the structure under it goes** (card 25): one that finished a tower or building hung at roof height for about 2 s.
- **The golden replays print one line per checkpoint at 6 decimals** (6.1): 3 decimals missed a 1e-6 damage change.

**Bot** (section 8)

- **The "never answer air with 0" rule applies to threats ≥ 50% in the air**, ground beans offset only the ground share, and a careful bot saves up (`holdAir`): the spec gave no scope for mixed threats.
- **Building spots are +68 / +77 / +70** in front of the tower: the spec's +40 / +60 would overlap it.
- **Exact building conditions, building help in `threat()`, build-ahead, and a building at the leak point**: the Crane sat in hand 87% of a match and was played 0.2–0.4 times.
- **Peels value expected slips; the Sneeze scales by heft; the Anvil halves fast targets and aims with half the noise; the Soda counts 85 against beans and 65 against structures** (its 34 px column missed about 20% of casts at full noise).
- **Bubble Wrap also goes on our beans under an incoming enemy spell.**
- **Brollies skip back-line targets behind walls, need a target worth ≥ 2.5, at most one drop per 5 s.**
- **The Pogo never rushes a building above 30% health; the Brick takes −0.3 as a leader while one stands; the Drummer can be a last-resort leak; Propeller Pals defend only against threats with under 20% shooters; a high Pelican counts half for the Netter.**
- **Full mana with no unit in hand spends anyway (`leakSpare`)**: with only spells and buildings in hand while one of its buildings stood, the bot sat on 10 mana for up to a building's life (24 s; 14–20 s a match for Fortress against a side that never plays). Now it spends within about 0.7 s.
- **`LEAD = { bigJelly: 1 }`**: the 7-mana Jelly was a dead slot (0.4 plays a match in Jelly Parade). Two Pogo variants (punish from 6 mana, follow a push over the bridge) gained nothing and were not landed; nor were Crane variants that played it twice as often but won less (38%).

**Meta and menus** (section 7)

- **The arena gate applies only to the five newer styles** (their `arena` field): applied to the old five it would leave Green Hills with only Swarm.
- **Hop Cycle, Fizz Pop and Fortress rebuilt; Sky Circus and Jelly Parade one card each; Turtle's Cheese Wheel → Nutcracker**: the first newer lists lost to every original style (25–38%), and no style played the Nutcracker.
- **A legendary in a Big Chest replaces a stack before the "a common carries the bulk" fix-up**: so the chest keeps its guaranteed rare and a common stack.
- **The shop's legendary day is `rng.int(1, 1)` and `rng.pick` on offer i = 2, after every existing draw.**
- **"Targets" uses one vocabulary for all 32 cards, and every card-detail number is read from the sim tables** (a test patches every table number and checks every row follows).
- **One-time tips for the first flier, building and legendary (`profile.firsts`)**, shown whenever the hub's modals close.
- **The "No air answer" hint lives in the Collection header**: at 667×375 anything under the deck is out of sight.
- **The five badges pay 100–150 Jellybeans; W6 chose the stat names.**
- **The legendary sheen sweeps on every legendary face, in step**, not only on the deck screen.
- **The hub's demo match plays the newest style(s) half the time**: Summit cards showed up in about 1 demo deck in 24.
- **Saves are v3, and every load gives back the Trail cards a 14-card window dropped**: both builds wrote v2, so a window still running the 14-card game (a match or the Sandbox defers its update) overwrote the save with all 18 new cards stripped, for good.
- **The shop day of the update keeps the 14-card stock** (`shop.cards14`): re-rolled from 32 cards, the Sold marks and the claimed gift moved to other offers, sometimes a Legendary.
- **The Crane's card detail reads Reach 136 (where its ball still hits, from the face, like the Box's) and Targets "Ground & low fliers"**: it showed its wake-up `sense` (230) and "Ground", though the ball never hits past about 160 px from the mast and does hit fliers.
- **One card or one legendary reads singular** ("A new card!", "Wrecking Crane joins …"), and the veteran notice says "your 1 star".

**Render and integration**

- **A Brolly fades in over 0.35 s and stays see-through under the HUD's top row** (3.4): at 844×390 it appeared right under the clock.
- **Tower and building HP bars thin to 40% while a flier covers them** (card 31): a Pelican cruises at bar height and vanished behind the bar.
- **A building's HP bar waits for its crate to land, and bars are nudged below any bar they would cover** (3.3).
- **Comic words draw over the HP bars**: bars cut through BOING!, OOF! and PTOO!.
- **The Anvil and Soda aims show what will land** (a hanging anvil with a drop line, the bottle): the Anvil's 34 px circle was about 29 px wide on a phone.
- **New heavy hits use the bonk juice; Juggler bombs get a quiet boom with no hit-stop or word; the Anvil a 0.07 s hit-stop.**
- **Juggler bombs and `fx.follow` run in the Sandbox too; Sandbox keys 1–9 work again** (the old string compare broke 2–9 at 18 unit types).
- **The balance tool reads `ARCHETYPES` and `AIR_ANSWERS` from `meta/`**: its copy had already drifted.
- **The Anvil's pancake pivots on the bean's own feet**: a squashed flier jumped about 150 px down toward the lane, away from its HP bar and shadow.
- **`lerpIn` moves `px/py` with `x/y`** (6.3): the Sprout's leaves and the Pogo's BOING lines read speed from `x − px`, so they flickered with the interpolation phase.
- **A full Bean Patch doesn't shake its tufts** (the renderer counts live Sprouts as the sim does), and the building looks' fallback numbers equal the sim's (a test checks every one): the Crane's aim ghost marked its wake-up range at 190 px, the sim's is 230.
- **The aim tip shows only on a play that would be refused** (`aimCheck`/`aimTip` in `render/spells.js`): a building aimed just past the midline said "Build on your side" in red and then built.
- **A Brolly play sounds only its umbrella**: each of its three beans also played the hand-of-god "drop".
- **The Sandbox's card row scrolls to its first card on an upright phone** (`justify-content: safe center`), and desktop key labels show only on the 9 cards a key picks.
- **Spell renderers record what they catch** (`render/spells.js` `spellErrors`): a frame still never breaks, but a test can now see a spell that throws.

### 13.3 Measured balance

**Card table** (`--n 40`, seeds 1 and 3 pooled, 960 matches): win rate with the card against without [95% interval], then plays per match by a deck holding it. The newer 18 are marked *; L = legendary.

| Card | With/without | Card | With/without |
| --- | --- | --- | --- |
| clubbers | 54% [49–60] 4.3 | sprouts* | 43% [38–48] 5.0 |
| squire | 48% [43–53] 4.3 | bananaPeels* | 44% [39–50] 1.5 |
| archers | **64%** [59–69] 4.3 | propellerPals* | 60% [55–65] 4.1 |
| spikers | 57% [52–62] 4.8 | pogoBean* | 44% [39–49] 1.4 |
| bomb | 39% [34–45] 4.0 | netter* | 46% [41–51] 4.5 |
| arrowRain | 52% [47–57] 2.2 | bigSneeze* | 48% [43–53] 2.5 |
| boulder | 51% [46–57] 1.8 | shakenSoda* | 43% [38–48] 3.3 |
| clubberGang | 58% [53–63] 2.8 | bombJuggler* L | 51% [46–57] 3.0 |
| bruiser | 48% [43–54] 3.9 | boingBox* | 52% [46–57] 1.6 |
| brick | 48% [43–53] 1.6 | beanPatch* | 46% [41–51] 2.1 |
| cheeseWheel | 47% [42–52] 1.2 | anvil* | 52% [47–57] 3.3 |
| bombSquad | 49% [44–54] 3.1 | nutcracker* | 55% [49–60] 3.8 |
| megaBomb | 43% [38–48] 3.0 | wreckingCrane* L | 43% [38–48] 1.1 |
| shieldWall | 58% [53–63] 1.6 | brollyBrigade* | 46% [41–51] 2.1 |
| | | bubbleWrap* | 48% [42–53] 2.4 |
| | | tummyDrummer* | 52% [47–57] 3.0 |
| | | pelican* L | 55% [50–60] 2.9 |
| | | bigJelly* L | 54% [49–59] 2.5 |

- **The newer 18:** 43–60%, all inside 40–60% (Propeller Pals at the top edge). **The legendaries:** 51–55%, except the Wrecking Crane at 43%, under its 45–55% band; on four seeds (1, 3, 5 and 7, about 1,900 matches) it reads 45% [41–48], at the edge.
- **The original 14:** 43–58%, except Archers at 64%, above their 40–62% band, and the Bomb at 39%, just under it (40% on four seeds). Both are original cards and play bit-identically; they were left alone.
- **What the review fixes moved** (the same seeds on the code before them; four seeds): the Tummy Drummer 44 → 54% (its beat no longer makes heavy swings miss), the Wrecking Crane 50 → 45%, the Mega Bomb 47 → 43%, the Nutcracker 57 → 53% and the Anvil 57 → 54%; every other card by 4 points or less.
- **Near the edges:** Sprouts, Shaken Soda, Mega Bomb and the Crane (43%) at the bottom; Propeller Pals (60%) at the top; the Pelican (55%) at the legendary cap.

**Styles.** Each style's average win rate against the other ten decks (starter plus the ten `ARCHETYPES`, all cards unlocked, 40 matches a pair, about ±15% a cell):

| Deck | Average | Deck | Average |
| --- | ---: | --- | ---: |
| starter | 48% | **Hop Cycle** | **52%** |
| Bonk Rush | 62% | **Fizz Pop** | **45%** |
| Siege | 50% | **Fortress** | **51%** |
| Big Boom | 38% | **Sky Circus** | **46%** |
| Turtle | 53% | **Jelly Parade** | **53%** |
| Swarm | 52% | | |

Before the polish the newer styles averaged Hop 38%, Fizz 31%, Fortress 25%, Sky 53% and Parade 49%; before the review fixes (the same matrix, same seeds) Hop 53%, Fizz 46%, Fortress 50%, Sky 49% and Parade 54%. Every cell between two original styles replayed identically.

**Single matchups still above 65%** (row beats column). The contract asks ≤ 65% (and ≤ 60% for a newer deck); not met, and left for the next round, because every card in these decks is inside its band:

- With a newer style: Jelly Parade vs Fizz Pop 83%, Hop Cycle vs Big Boom 75%, Turtle vs Fortress 75%, Bonk Rush vs Fizz Pop 73%, Fortress vs Big Boom 73%, Fortress vs Swarm 70%, Fortress vs Sky Circus 70%, and 68% each for Bonk Rush vs Hop Cycle, Siege vs Fortress and Jelly Parade vs Sky Circus.
- Among the original styles: Turtle vs Siege 90%, Bonk Rush vs Siege 85%, Siege vs Big Boom 80%, Swarm vs Turtle 73%, Swarm vs Big Boom 68%.

**Match shape** (random 32-card decks, equal skill): castle 20%, tiebreak 20%, time 37%, overtime 23%.

**Levels and skill** (the starter-only sections can't move: the 14 original cards are bit-identical): one level up wins 91% (level 2 vs 1) and 93% (6 vs 5). Skill 0.9 beats 0.3 88% of the time, 0.6 beats 0.3 84%, 0.5 beats 0.05 99%, 0.3 beats 0.05 94%. The newbie beats the Training Dummy 99%; it also beats a skill-0.3 bot 73% with starter decks (already so with the 14 original cards) but only 57% with random 32-card decks, so no new card plays itself.

**CPU.** Random-deck matches cost 0.21 CPU-s per simulated minute on average (the worst single match read 2.15 on a busy machine). `--only perf`, minute 1 / minute 2: the busy 14-card baseline 1.80 / 1.00, two Bean Patches a side 1.22 / 1.18, the Jelly push against a Crane 1.06 / 0.55, the sky full of fliers 1.49 / 1.75. Every worst minute is under the 3.0 budget, so `MAX_LIVE` and the Patch `max` stayed as they are.
