# Sound effects: the soundscape of prototype 0

The zombie run sounds like a recorded game now: real guns with their mechanics, bullets that crack
off walls and thud into the infected, footsteps on whatever is underfoot, a horde you hear coming,
specials with their own voices, and each level's own air (wind, crickets, water, an office's hum).
Everything is cut from four purchased sound libraries; only the sounds the game uses ship.

| File | Role |
|---|---|
| `AudioPacks/` | The purchased libraries (1.2 GB of 96 kHz WAV). **Not in git** (`.gitignore`) |
| `tools/sfx/build_sfx.py` | Takes the picks out of `AudioPacks/`, trims and levels them, writes `assets/sfx/` |
| `assets/sfx/*.mp3` | 7 files, 3 MB: `sfx-mono` (world one-shots, 44.1 kHz), `sfx-lo` (voices and rumbles, 22 kHz), `sfx-stereo` (your guns, explosions), `amb-*` (ambience beds) |
| `assets/sfx/bank.js` | Where every sound sits in those files. Generated; do not edit by hand |
| `src/sfx-bank.js` | Loads and decodes the files, lines them up, hands out variants |
| `src/audio.js` | The mixer and every sound's recipe (what plays, how loud, where) |
| `src/audio-synth.js` | The old synth: the fallback while files load, and a few sounds on purpose |
| `src/game/soundscape.js` | Pure logic: surfaces, impact materials, level ambience, what loops sit in the world this frame |
| `tests/sfx.test.js` | The bank ships what the engine asks for; surfaces, materials, scene; the engine in node |

## How it plays

- **Placed in the world:** everything that happens somewhere gets quieter and duller with
  distance, pans by where it is *on screen* (so the isometric Building pans right), and sends more
  to the reverb the farther it is. With a wall between you and it (the same line-of-sight test the
  zombies use) it is muffled and quieter: a horde behind a building sounds behind a building.
- **Rooms:** a reverb shaped like the level: short slapback in the streets, a tight room in the
  Building, a long thin tail on open ground (docks, suburbia, cemetery), something in between in
  the junkyard.
- **Variation:** every sound has several takes (293 in all); a take never plays twice in a row,
  and pitch and level vary a little each time.
- **Voice limits:** each kind of sound has a cap (zombie voices 7, impacts 6, ...); past it, a new
  sound only plays if it is louder than the quietest one playing. 64 voices at most.
- **Mix:** your sounds, the world and the ambience are separate buses into a gentle glue
  compressor and a limiter. Your gunfire ducks the ambience a little; a Tank's roar, the Witch's
  scream, the safe-room door and explosions duck it more. A blast close by muffles everything for
  a moment and your ears ring; when you die the world goes dull and far away. The music
  (`docs/MUSIC.md`) has its own path: no compressor, no ducking. Only a last safety limiter on
  the sum of the two keeps a gunshot on a loud bar from clipping.

## What plays when

| Event | Sound |
|---|---|
| SMG, assault rifle | A first shot, short bodies, and one tail restarted with every shot, so a burst rings out after the last round (how the library's automatic guns are built) |
| Shotgun, hunting rifle | Full shots with their own tails |
| Reload | Magazine out, magazine in a little past halfway, the bolt or charging handle at the end; the shotgun loads shell by shell and pumps. Swapping guns cancels a reload's sounds |
| Swap, dry fire | A gear grab, then that gun's own sound; an empty click |
| Footsteps | Synced to the legs. Concrete, grass, gravel, dirt, wood (the piers) or metal (the junkyard scale), read off the map under your feet; run or walk by speed; a little gear rattle. The teammate's steps too |
| Bullet hits a wall / car / crate / headstone | Concrete, heavy metal, light metal (barrels, vending machines), wood, dirt or stone |
| Bullet hits one of the infected | A flesh impact (a heavier thump on the Tank and the Witch) |
| One of them dies | A splat, sometimes a bone, sometimes a last sound, and the body dropping a moment later |
| Idle / alerted / winding up a swipe | Groans, snarls, attack calls: 344 Audio's zombie voices |
| A mob ("HERE THEY COME!") | A rising swell, then screams from where they'll come from, and a low hit |
| The horde on you | A crowd bed (voices, and running feet) that rises with how many are chasing you and how close, and pans to where they are |
| Shove | A swing, and a punch when it lands |
| You get hit / die | Body blows (no voice: "you" have no voice); a fall, and the world going dull |
| Scavenging | Rummaging in a bag, a crate lid (a heavy hatch for the secret), a soft chime for the find |
| Boards | Wood hits; breaking: splinters, the planks dropping |
| Holdout gate | A breaker and a spark on the control box; the gate grinding and slamming open |
| Explosions | A big blast, a fireball, debris raining down |
| Hunter | A rattling growl, a scream as it pounces, the hit when it lands on you, claws |
| Tank | Deep roars (pitched down), heavy footsteps, the punch, the rock flying and shattering, its death |
| Night Terror | Whispers, a sharp in-breath before it lunges (a breath played backwards), a shriek in the light |
| Witch | Her growl as her patience runs out, her scream, her nails, her death |
| Pier 9 | The flare's sparks and pop; it burns as a hiss where it hangs; radio static with each message from the ferry; the ferry's engine as she sails in |
| Safe room | The door slamming shut behind you and the bolt |
| Title card | A click for the level buttons and Start |

**Still synthesized on purpose:** the car and fire alarms and the holdout siren (they are
electronic anyway), the ice-cream truck's warped jingle, Ben's whistled tune, the Witch's crying
and the tune she hums, the ferry's horn (now with the open-water reverb under it) and the
heartbeat. Everything else falls back to the old synth only while its file is still loading.

## Ambience

| Level | Beds | Now and then, far off |
|---|---|---|
| Streets | Wind | Screams, glass breaking, thunder, an explosion, metal |
| Building | Room tone (hum) | Someone pounding on a door, pipes, a groan through the walls, creaks, a door |
| Pier 9 | Water, wind | A hull or crane groaning, creaking wood, screams, thunder |
| Suburbia | Crickets, a little wind | A swing set in the wind, screams, glass, creaks |
| Graveyard | Crickets, wind | A crow, branches, thunder, a groan |
| Junkyard | Wind, a few crickets | Metal, scrap settling, screams, thunder |

Loops placed in the world: every fire (burning wrecks, barrels, the gas station after it blows,
fading out as it burns down), a generator hum under the floodlight towers, the flare, the ferry's
engine. The six nearest play. **Ambience** in the settings panel sets all of it (on top of
**Volume**).

## Changing the sounds

1. The whole sound list is the `PICKS` section of `tools/sfx/build_sfx.py`: which source files
   make each sound, how long it may be, filters, and which file it goes in.
2. Run it with a Python that has numpy, scipy and soundfile (libsndfile 1.1+ for MP3). The YuE2
   venv from ai-music-studio has them:
   `"%USERPROFILE%\Documents\AI_Models\MusicGen\Yue2\.venv\Scripts\python.exe" tools\sfx\build_sfx.py`
   (`--check` only checks the sources are there). It rewrites `assets/sfx/` in about 10 seconds.
3. How loud each sound plays, and how it is layered, is in `src/audio.js` (one method per game
   event). Level ambience is `AMBIENCE` in `src/game/soundscape.js`.
4. `npm test` checks that every sound `src/audio.js` asks for is in the bank.

Every variant is levelled to the same loudness at build time, so the mix lives in one place.
Bass-heavy sounds (explosions, the Tank, wood steps, body falls) get added harmonics of their
lows so a phone speaker still carries them.

In the browser console, `__p0.audio.status()` shows what is loaded, how far each file was shifted
to line up, and how many voices are playing.

## Formats and memory

MP3 (VBR) like the music, so it plays everywhere. Several sounds share a file, so the game makes 3
requests when the sound starts, plus the level's one or two ambience files. Each file begins with a short blip at a
known time: the game measures where the browser's decoder put it, so decoders that keep the
encoder delay (Safari) and ones that trim it (Chrome, Firefox) line up the same. Files carry a
content hash in their URL, so a cached old file is never paired with a new `bank.js`. Voices,
rumbles and ambience have nothing up high, so they are stored and decoded at 22 kHz: about 45 MB
of decoded audio in all, against about 65 MB with everything at full rate.

## Sources and licenses

- **344 Audio, Zombie Specimens Vol. 2:** the infected's voices. Its EULA (in the pack's
  Documentation folder) allows the sounds in video games and websites as part of the production,
  not on their own: that is why `AudioPacks/` stays out of git and only processed excerpts ship.
- **Gamemaster Audio, Guns, Bullets and Explosions** and **Footstep and Foley Sounds** (with their
  Pro Sound Collection bonus sounds): guns, impacts, explosions, footsteps, foley, ambience loops,
  whooshes, doors, the crow.
- **Gore SFX Pack (VADI):** splats, bone breaks, slashes.

The Gamemaster and Gore folders carry no license file: check their store licenses before a
commercial release.
