# The announce trailer: "We Left Ben", 2-4 player co-op

A 72-second announce trailer for We Left Ben, cut to the game's own title theme. Every frame is the
real game: the prototype 0 engine running scripted shots (a squad of four, hordes, the specials,
six maps), filmed frame by frame in headless Chromium. Nothing is mocked up or painted over, apart
from the titles, the letterbox and the film grain.

| | |
|---|---|
| Watch it in the browser | `trailer/` (plays live; click to start, sound on) |
| Render the video | `node trailer/tools/render.mjs` → `trailer/out/we-left-ben-trailer.mp4` (1920x1080, 30 fps, about 5 min) |
| The storyboard | `trailer/src/shots.js` (shots, words, music, mix) |

## The pitch, after Left 4 Dead (2008)

Valve sold Left 4 Dead as a zombie movie you play with friends, not as a shooter. The trailer
borrows that, point by point:

| What worked for L4D | What the trailer does |
|---|---|
| **The zombie-movie fantasy:** four ordinary survivors, campaigns presented like horror films | It opens like a film: letterbox bars, a typed dateline (PHILADELPHIA · 2020), a premise (NOBODY SLEEPS ANYMORE), a mystery (WE LEFT HIM BEHIND. HE KEEPS LEAVING SIGNS.). The bars drop away when the climax hits: the film turns into the game. The places on the way to Pier 9 get location cards like a film's (CENTER CITY, DELCO, WISSAHICKON HILL, SOUTHWEST PHILLY, PIER 9). |
| **Four survivors with names** | Teo, Mags, Odile and Lou are introduced by name, with a line each taken from the game's own walls: TEO "says he can hotwire it", MAGS "he can't", ODILE "writes it all down", LOU "counts generously". |
| **Overwhelming hordes** | The climax opens on a horde pouring in from every street at once, in slow motion. |
| **Dark humour** | The graffiti does the jokes, on camera: RED LIGHT CARS = DINNER BELLS (right before Lou shoots one), BUS NOT COMING. WE CHECKED. TWICE., LOU: 112 (HE COUNTED THE STONES), an ice-cream truck playing its tune while the suburbs come for them, NO RUNNING ON THE GANGWAY / (RUN.). |
| **The AI Director: replayability** | NO TWO NIGHTS THE SAME., over a run of different maps. |
| **Co-op, and inviting friends** | 2-4 PLAYER CO-OP twice; the teamwork beats are the ones L4D was known for: a teammate shoving a Hunter off you, a revive under fire, four survivors back to back. And the thesis, tied to the game's title: THIS TIME, NOBODY GETS LEFT BEHIND. Ben's reply, in his orange crayon: "promise?" |
| **A clear identity** | Four survivors, endless infected, one way out (the ferry from Pier 9). And Ben: the trailer ends on him, "bring your friends. / i'll count them.", and his eyes in the dark. |

## Shot list

The title theme (`assets/music/menu.mp3`) is 75 BPM: a bar every 3.2 s from 0.096 s. Its shape is the
trailer's: a quiet open, an entrance on beat 3 of bar 3, a build, a held breath in bar 11, a climax
from bar 12 to bar 18, then near silence.

| Time | Shot | On screen | Words |
|---|---|---|---|
| 0:00 | open | black | PHILADELPHIA · 2020 (typed) |
| 0:03 | drowse | a crane down over Center City at night: drowsers standing in a park, a burning wreck | NOBODY SLEEPS ANYMORE. |
| 0:10 | slumbra | a wall of posters: EVACUATION · PIER (LIE?), STAY HOME, SLUMBRA ("NO!!") | |
| 0:11 | saferoom | the first safe room: DAY 1 HERE. DAY 2 LEAVING. and, in orange crayon, "day 3. you left." | WE LEFT HIM BEHIND. |
| 0:16 | sorry, knows | SORRY BEN / "it's ok"; BEN KNOWS THE WAY — TEO / "i do" | HE KEEPS LEAVING SIGNS. |
| 0:19 | drawing | the squad's flashlights on Ben's chalk drawing: "my squad", five holding hands, one orange figure apart | |
| 0:22 | glimpse | the beam finds two little eyes in a dark park | |
| 0:25 | squad | the four walk out, onto COUNT YOUR FRIENDS. AGAIN. | name tags; 2-4 PLAYER CO-OP |
| 0:32 | alarm | Lou shoots a car with a red light, next to RED LIGHT CARS = DINNER BELLS. Then the breath: the alarm far away | THIS TIME, NOBODY GETS LEFT BEHIND. "promise?" |
| 0:38 | drop | the horde from every side, slow motion in | CENTER CITY |
| 0:41 | icecream | Delco: an ice-cream truck's alarm, a horde through the playground | DELCO |
| 0:44 | graveyard, junkyard | the cemetery paths; the crusher | NO TWO NIGHTS THE SAME. |
| 0:48 | tank | the Tank's haymaker sends Lou flying (slow motion) | |
| 0:51 | hunter | a Hunter pounces on Teo; the squad runs in and shoves it off | |
| 0:53 | witch | she's up | |
| 0:54 | revive | Odile back on her feet under fire | |
| 0:56 | pier | Pier 9: the LIBERTY BELLE alongside, the horde down the pier | PIER 9 |
| 0:57 | logo | the logo | 2-4 PLAYER CO-OP; COMING SOON · iOS & ANDROID |
| 1:04 | ben | black; somebody whistles | "bring your friends." "i'll count them." and his eyes |

## How it's made

```
trailer/index.html         the page: fonts, the canvas, the play button
trailer/src/clock.js       the film clock and dice: Math.random is seeded per shot, performance.now is film time
trailer/src/stage.js       a take: its own Game, the squad (looks, follow slots), the lead's autopilot, the camera rig
trailer/src/staging.js     staging helpers: drowsers, a horde on its way, the specials where the camera is, finding things
trailer/src/shots.js       the storyboard: FILM (shots), CARDS (words), FX (letterbox, fades, flashes), MUSIC, MIX, SFX
trailer/src/titles.js      the words and the film look (typewriter, titles, Ben's crayon, name tags, logo, eyes, grain)
trailer/src/score.js       the sound: the game's own Audio on a stand-in context whose clock is the film's
trailer/src/main.js        the film (which shot is on when), live playback, the capture API (window.__trailer)
trailer/tools/render.mjs   films it in headless Chromium and encodes it with ffmpeg
trailer/tools/scout.mjs    location scouting: what's where on a map (posters, graffiti, alarm cars, Ben's traces...)
trailer/fonts/             Bebas Neue and Gochi Hand (SIL OFL), Special Elite and Permanent Marker (Apache 2.0)
```

- **A shot is a run of the game.** Each one builds its own map (level and seed), dresses the squad,
  places what the shot needs (drowsers, a horde already running, a Tank, a Witch), simulates a few
  seconds before its first frame so the action is going when the cut lands, and then plays on the
  film clock. Slow motion is a shot's `rate`. Cues are timed on the film clock, so they land on the
  music. A shot plays the same however it is reached: from the top, mid-way (a partial render), or
  built ahead (live playback).
- **The squad** is the game's lead survivor (driven by an autopilot through the same input frame a
  thumb gives it) plus three of the game's AI teammates. The engine now has room for more than one
  teammate (`game.allies`, below).
- **The sound is the game's.** In a capture, the game's Audio runs on an OfflineAudioContext behind a
  stand-in whose `currentTime` is the film clock: every gunshot, groan, alarm and Witch scream is
  scheduled at the frame it happens in, the music edit and the mix moves go into the same graph, and
  the whole track renders at the end, in sync. Live, it is the same graph on a real AudioContext.
  The render tool masters it to -14 LUFS with a -1.5 dBTP ceiling.
- **Deterministic:** the same files film the same trailer, frame for frame.

### Render options

```
node trailer/tools/render.mjs                      the whole trailer, with sound
node trailer/tools/render.mjs --from 38 --to 48    a stretch (add --audio for its sound)
node trailer/tools/render.mjs --stills 12,40.5     single frames as PNG (with where the squad is)
node trailer/tools/render.mjs --trace hunter       what happens in a shot, 10 times a second (for timing cues)
node trailer/tools/scout.mjs city 1337 graffiti    what's where on a map
  --fps 30  --crf 18  --width 1280 --height 720 --scale 1.5 (= 1920x1080)  --out FILE
```

Needs Playwright with Chromium and ffmpeg (both are in Claude Code's cloud sessions). The page
also needs a static server for live playback (`npm start`, then `http://localhost:8080/trailer/`).

### Changing it

- **Words:** `CARDS` in `shots.js` (kind, text, time, place). COMING SOON · iOS & ANDROID is a
  placeholder: put the real date, platforms or call to action there (pre-register, wishlist).
- **Music:** `MUSIC` and `MIX`. Every time in the storyboard is written in bars (`bar(k, beat)`), so a
  different track at another tempo mostly means setting `BPM` and `BAR0` and moving a few bars.
- **Shots:** `FILM`. Use `--stills` and `--trace` to frame and time them, `scout.mjs` to find things.

## What changed in the game

- **Squads.** `game.allies` holds any number of AI teammates; `game.ally` is still the first (the
  tuning panel's teammate), and `game.addAlly(weapon, at)` brings more. Zombies go for the nearest
  survivor, every teammate pushes the crowd and keeps out of the others' way, each carries a
  flashlight, the Tank's swing, its rocks, fire and blasts hit whichever teammate is there, the
  Night Terror feels every beam, and a teammate holds fire while another one is in the line. Each
  teammate can have its own follow spot (`spotBack`, `spotSide`) and look (`look`). With one
  teammate the game plays exactly as before. `tests/squad.test.js` covers it.
- **The renderer** draws without the HUD when `ui.hud === false`, and the lead survivor can wear
  its own look (`player.look`), like the teammates.

## Licences: read before publishing

- **Music: not cleared for a commercial release.** The title theme is the prototype's music, made
  with YuE2, whose weights are CC BY-NC 4.0 (see [MUSIC.md](MUSIC.md)). Fine for a pitch, a playtest
  or an internal showing; for a public marketing trailer, replace it with a licensed track
  (`MUSIC` in `shots.js`).
- **Sound effects:** the game's processed excerpts (see [SFX.md](SFX.md)). The infected's voices are
  licensed for use in the game "as part of the production"; check the Gamemaster and Gore store
  licences before a commercial release, as SFX.md says.
- **Fonts:** SIL OFL and Apache 2.0, licences next to the files in `trailer/fonts/`. The trailer
  page maps the game's graffiti and crayon font names (Marker Felt, Chalkboard SE, Comic Sans MS)
  onto them, so the walls read the same on every machine that plays or films it.
- **The special infected** are not named on screen (Tank, Witch and Hunter are Left 4 Dead's names).
