# Strays (a metagame prototype: a pocket shelter)

A landscape, mobile-first **metagame** prototype with a tamagotchi-like feel,
written from scratch: it shares no code, art or systems with the earlier
metagame prototypes. Trips out are **simulated** (a few seconds of street);
that is where a round of the action game would go. It lives in
[`strays/`](../strays) and runs at `/strays/` (on Pages:
`https://miikka-boom.github.io/FunLand2/strays/`, locally
`http://localhost:8080/strays/` with `npm start`).

> Every stray is somebody.

## The brief, and the idea

The brief: *another zombie base metagame, from scratch. The previous ones were
too complex and not satisfying enough. A tamagotchi-like feel. You collect
random survivors to your grid-based base.*

So this one is a **toy**, not a management game. It looks like a yellow pocket
toy with a little pixel screen and two buttons, and it works like the egg toys
did: small creatures who live on while you are away, who want one thing at a
time, and who grow into something you could not predict.

- **The base is a grid of rooms, and the base is the people.** A block of
  twelve rooms, four across and three up. There is nothing to build or
  upgrade: a room gets its wallpaper, its bed and its one piece of furniture
  from whoever lives in it. The block lights up room by room.
- **Random survivors, hidden at first.** Everybody arrives as a hooded
  **stray**. Who is under the hood (one of eighteen kinds, in four rarities)
  was settled when they turned up, but you only find out by looking after
  them. The only hint is the colour of the patch on their blanket.
- **One thing at a time.** Each person shows at most one wish, as a bubble:
  hungry, wants a hug, hurt, ready to grow. You tap it. That is the whole
  control scheme, plus one big button.
- **One number.** Cans. They feed people and they open rooms.

## How it plays

**The first minute.** One room is open and somebody is asleep in a sleeping
bag. Tap the bag: a stray climbs out, hungry. Tap: a can flies over, chomp,
two hearts drop into the bar under the room. A moment later they want a hug.
Tap: the bar is full. Tap once more: the screen flashes, the hood flies off,
and a card says who it was all along (*"ACE IS A MECHANIC"*). Now the GO OUT
button pulses.

**The loop.**

1. **GO OUT.** One person goes (you pick, if several can). A few seconds of
   street: cans picked up, a zombie in the way. They come home with cans and a
   heart or two, and then they rest.
2. **Somebody follows them home.** Sometimes a hooded stray comes running up
   behind. If a room is ready they hop straight in; if not they wait at the
   front door until you open one.
3. **Open a room.** Tap a boarded-up room next to one of yours, tap again to
   pay. The boards fly off, the stray moves in and falls asleep in their bag.
4. **Look after them.** Wake them, feed them, hug them, and the hood comes
   off: a cook, a clown, an astronaut. Keep going and they become a **hero**.
5. Now two people can go out.

**Coming back.** Everything runs on the clock, also while the toy is closed.
Come back after lunch and half the block has a bubble up: bellies, hugs,
somebody rested and ready to go, two zombies at the back fence. A minute of
tapping (or one swipe across a row of rooms), a few trips, maybe a new face,
and everybody is content again. The status line says when the next thing will
happen (*"ALL COSY. BACK IN 12 MIN"*), so it is always clear when a sitting is
over.

**The end.** Twelve somebodies is a full house; twelve heroes is the end of
the prototype. Both get a little party. The toy keeps running afterwards.

## The whole rulebook

| | |
|---|---|
| **Rooms** | 12, in a 4×3 grid. One starts open. A boarded room opens for cans, next to a room that is already open. Each costs more than the last (4, 7, 12, 18, 26, 36, 48, 60, 75, 90, 110). |
| **Arriving** | A new person sleeps in a bag for a little while (seconds for the first few, five minutes later on), then can be woken with a tap. |
| **Strays** | Hooded. Hungry at once, and want a hug soon after. Too scared to go out. At **3 hearts** they show who they are. |
| **Somebodies** | One of 18 kinds. Hungry about every 2½ hours, want a hug about every 45 minutes. Can go out. At **14 hearts** they become heroes. |
| **Heroes** | Find more cans, rarely get hurt, need no looking after. |
| **Hearts** | A meal +2 (costs 1 can). A hug +1 (free). Patching somebody up +1. A trip +1, a great trip +2. |
| **Wishes** | One bubble at a time, most urgent first: hurt, ready to grow, (asleep), hungry, hug. With no cans left, a hug is asked for before a meal. |
| **Trips** | One person at a time. Great, good or rough (a somebody: 25/50/25; a hero: 50/40/10). Cans: 3 to 5 for a somebody, 6 to 8 for a hero, +2 if great, -2 if rough, and +1/+2/+3 for a rare/epic/secret kind. Afterwards they rest 20 minutes (heroes 30). A rough trip also leaves them hurt until you tap. |
| **Followers** | If nobody is waiting at the door and the block isn't full, a stray follows a trip home 60% of the time, always on the first two trips, and always after two trips alone. |
| **Who they are** | Rolled when they arrive: common 58, rare 30, epic 10, secret 2 (among the rarities that still have somebody the block hasn't met). Nobody moves in twice. 18 kinds for 12 rooms: every block has its own crowd. |
| **Zombies** | Gather at the back fence, one every 6 minutes, three at most, also while you are away. Tap to bonk; about half drop a can (never three duds in a row). They do no harm. |

That is all of it. Nobody dies, nobody leaves, nobody is turned away.

## The eighteen

| Common | Rare (+1 can a trip) | Epic (+2) | Secret (+3) |
|---|---|---|---|
| Cook, Nurse, Mechanic, Student, Jogger, Farmer, Knitter, Skater | Firefighter, DJ, Clown, Wrestler, Scientist, Magician | Astronaut, Mascot, Knight | A nice zombie |

Each has a hat or headgear you can read at 16 pixels, an outfit, a thing for
their room (the cook's stove, the DJ's speaker, the astronaut's rocket), a
line they say when the hood comes off, and something they carry once they are
a hero. Their name, skin, hair and a small habit (pacing, dancing, humming,
yawning) are random.

## The toy

- **The shell** is the page: yellow plastic, a dark bezel, BOOK on the left,
  a big red GO OUT on the right, a lamp that blinks when somebody wants you,
  a sound switch, and a TEST pinhole for the testing drawer. On a big screen
  it lies on a table; on a phone it fills the screen.
- **The screen** is 152×84 pixels, drawn in whole pixels and blown up with
  hard edges and a faint dot grid (always a whole number of device pixels per
  pixel). People are 16×16 sprites authored as rows of letters
  ([`sprites.js`](../strays/src/sprites.js)); the lettering is a five-pixel
  font ([`font.js`](../strays/src/font.js)).
- **The status line** across the top shows the cans and one line of words:
  what just happened, or else the one next thing worth doing.
- **The sky** behind the block follows the clock: morning, day, dusk, night.
- **Sound** is a square-wave beeper: a chirp when somebody wants something, a
  rising note for every heart, a little tune when a hood comes off (longer
  for rarer kinds).
- **Touch:** tap a bubble; slide a finger across rooms to feed, hug and patch
  as you go. **Keys:** arrows and Enter work the rooms, Space is GO OUT, Z
  bonks, B opens the Book, M is sound, `` ` `` is the testing drawer.
- **The Book** shows all eighteen kinds as a 6×3 page: the ones you have met
  (with a star once they are heroes) and question marks for the rest, each
  with a corner in its rarity's colour.

## What was left out, on purpose

Earlier prototypes were "too complex". This one has no squad, no classes, no
levels, no stats, no gear, no second currency, no energy, no buildings, no
upgrades, no shop, no menus, no map, no missions list, no beds to juggle, no
farewells and no death. There is one screen, one number, one button and one
kind of tap.

What it keeps is the part of a tamagotchi that people remember: *it wants
something from me, I give it, it grows, and I didn't know what it would be.*

## Pacing

`npm run strays:balance` plays the first two weeks for three kinds of player
(a simulated player that does what the status line says, at human speed).
Medians of 80 blocks each, with the default tuning:

| | Casual (3 looks a day) | Keen (every 2 h) | Binge (hourly) |
|---|---|---|---|
| First face shown | 1 min | 1 min | 1 min |
| 3 somebodies | first sitting | first sitting | first sitting |
| First hero | day 2, morning | 8 h | 3 h |
| Full house (12) | 3.5 days | 32 h | 11 h |
| Twelve heroes | 4.5 days | 2 days | 1 day |

No sitting has nothing to do. The first sitting is deliberately dense (the
first few naps and rests are seconds long), then the toy settles into its
real rhythm of minutes and hours.

## Fair dice

- Every roll is named after the save's seed and a counter (the trip number,
  the arrival number, the bonk number), so reloading the page cannot re-roll
  a trip, a follower or who a stray is.
- The first trip always goes well, the first three never go badly, the first
  two always bring somebody home.
- No dry streaks: a follower is never more than three trips away, a can from
  the fence never more than three bonks.
- The first face is always a common one; rarity shows from the second on.

## Trying it in five minutes

Open `/strays/`, press any button, and tap what blinks. Then press **TEST**
(the pinhole under GO OUT, or the `` ` `` key):

- **Let time pass** (+10 min, +3 hours, +1 day) to see what coming back is
  like.
- **The next stray**: ask for a rare, an epic, the secret one, or a kind by
  name; **Somebody follows** makes the next trip bring them.
- **The next trip**: great, good or rough.
- **Skip ahead**: fill the block, or fill it with every heart bar full to see
  the ending.
- **Hand out** cans, a zombie, hunger, a stray at the door.
- Sliders for the main timings, scene speed, copy / load / reset the save.

## Code map

```
strays/index.html, strays.css   the shell (the yellow toy, its keys, the testing drawer)
strays/src/config.js            the grid, the 18 kinds, names, every tuning number
strays/src/rules.js             the rules: pure and seeded (no DOM, no Date, no Math.random)
strays/src/save.js              localStorage, and a migrate() that repairs any save
strays/src/clock.js             real time plus an offset (time jumps); a fake clock for tests
strays/src/util.js              seeded random streams
strays/src/sprites.js           every pixel as text: people, hats, strays, zombies, furniture, icons
strays/src/font.js              the five-pixel lettering and its three inline pictures
strays/src/words.js             every line the screen can say (tested to fit)
strays/src/lcd.js               the 152x84 buffer, blown up onto the page's canvas
strays/src/block.js             the block on screen: people, bubbles, taps, the little scenes
strays/src/outing.js            a trip, as a few seconds of street
strays/src/cards.js             the reveal card, the Book, the title, the two endings
strays/src/audio.js             the beeper
strays/src/dev.js               the testing drawer
strays/src/main.js              boot, layout, input, the loop, saving
strays/tools/player.mjs         a simulated player (used by the tests and the balance tool)
strays/tools/balance-sim.mjs    npm run strays:balance
tests/strays-rules.test.js      the rules, the save, seeds, the long haul
tests/strays-art.test.js        sprites, lettering, every line fits, the page
```

`window.__strays` exposes the game, the screen and the clock in the console.

## What to look at with players

- Does the hood make people care who is under it, or do they just tap?
- Is one wish at a time enough to do, and is the swipe found?
- Are 20 minutes of rest and 2½ hours between meals the right rhythm for a
  toy that sits next to an action game?
- Is twelve the right size for a block? (The obvious next step is a second
  block down the street, so the Book can be finished.)
- Does anybody miss a way to lose?
