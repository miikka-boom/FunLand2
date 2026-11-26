# The zombie models

The common infected in **We Left Ben** are the artist's 3D zombies: six big-headed
zombies with googly eyes, arms out in front, made in Blender and delivered as an FBX
and one texture. The game draws them on its plain 2D canvas, from their parts, posed
every frame.

## What's in the source

`tools/zombies/source/zombies.fbx` holds six zombies side by side, each a body and a
head; `zombies.png` is their texture.

- **A body** is a torso (shirt and trousers painted on), two arms (a block with three
  fingers) and two feet. Both arms are the same mesh, and so are both feet. There are
  two bodies: the normal one (zombies 1 to 5) and a big, heavy one (zombie 6).
- **A head** is a rounded skull with ears, googly eyes, an open mouth and sometimes
  hair: bald (twice, the mouth a little to one side on the second), a ponytail, a side
  fringe, and a wider skull (twice, the second for the big body).
- **Outlines**: every piece has a shell, the same shape a little bigger with its faces
  turned inward and coloured black (an inverted hull). Drawn with the near side culled,
  it leaves a black rim round the piece.
- **The texture** has four colour blocks with the same layout, and a palette strip
  (eye white, black) that they share:

  | Block | Where | Clothes and skin |
  |---|---|---|
  | A | top right | light shirt, grey trousers, green skin |
  | B | top left | light shirt, brown trousers, green skin |
  | C | bottom right | beige shirt, dark trousers, grey skin |
  | D | bottom left | tan shirt, dark trousers, pale skin (the big one) |

  Because the blocks are laid out alike, any part can wear any block: its UVs just
  shift (the palette's don't).

## Building

```
python3 tools/zombies/build_zombies.py
```

(needs numpy and Pillow) reads the FBX (binary, 7.x) and writes:

- `assets/zombies/meshes.js`: the parts in the game's axes (forward, right, up, in the
  model's centimetres, the ground at 0), each relative to its pivot (a shoulder, an
  ankle, the neck), with the mounts on each body. Positions, normals, UVs and triangles
  are base64 typed arrays, about 120 KB. Triangles are wound so that one culling rule
  serves skin and shells. UVs are given in block B.
- `assets/zombies/zombies.png`: the texture at 1024 px, its islands padded so the
  baker's mipmaps never pull in the background.

Re-export the FBX (same object names: `zombieN_body`, `zombieN_head`) and run the
script again to update the art.

## Drawing

`src/game/zombie-looks.js` lists the **looks**: the six zombies as made, plus their
heads in other colours (twelve in all, weighted). Every common gets one when it spawns.

`src/render/zombie-bake.js` is a small z-buffered rasterizer (pure JS, tested in Node).
It renders a part through the game's orthographic camera (`src/iso.js`), two samples a
pixel each way, with texture mipmaps. The shading is toon-style, to go with the
hand-inked texture: two bands of light with a soft edge, from a light fixed to the
camera, and a pale rim of light on the shadow side of skin and clothes. It can also
roll a head's pupils and shut its eyes: the build tool tags each head's eye whites,
their outlines and the pupils (`grp` in `meshes.js`). And it paints blood on: splats
placed in a part's own axes, with ragged edges, running down in drips, on skin and
clothes but never on the outlines (only the triangles a splat can reach pay for it).
It can tip a whole body back (onto its back or its face) and roll it onto a side.

`src/render/zombie-art.js` puts the horde together:

- **Sprites per part and facing.** A sprite depends only on the camera's tilt and zoom
  and on how the part is turned relative to the camera, so each part is baked once per
  facing (32 of them) and, for the arms, per pose (hanging, low, reaching, raised, up).
  They're packed into 1024 px atlas pages and drawn one to one on whole device pixels.
- **Baked when first wanted**, about 4 ms a frame at most. A zombie whose facing isn't
  ready yet borrows the nearest one that is, for a frame or two, and spare time warms up
  every look's first facings. When the tilt or zoom changes, it starts over once the
  change has settled.
- **Leaning toward the camera.** From the steep street camera (75°) a zombie would be
  mostly the top of its head, so the zombies lean toward the camera about their feet and
  their heads tip further toward it about the neck, whichever way they face. On screen a
  tilt toward the camera is the same as a lower camera, so the body's parts are baked and
  placed as if seen from 10° lower and the head from 35° lower again (`tiltPitches`). A
  camera that is already low leaves them be: bodies never go below 35°, heads below 20°.
- **Posed every frame**: feet step, the body bobs and sways, the head nods, the arms
  hang, reach, go up for a swing and come down on you, and flail when it's hit. A
  hunter's arms wave as it comes at you, as the stick figures' did: one goes up as the
  other comes down, twice a stride, a new pose every frame of it (`WAVE`, about four
  flaps a second; standing still, it keeps waving). The arm poses switch like drawn
  frames; the small motions are bobs. The walk is drawn in
  eight frames a stride, the way a drawn walk cycle is (below); the head's nod and each
  zombie's own slow sway stay smooth.
- **Two draws a zombie.** A shambling or hunting zombie's body (its feet, torso and arms
  as posed for one frame of its walk) is put together from its parts into one sprite, a
  *composite*, shared by every zombie of the same look, facing, frame, shirt and light,
  and its head is drawn on its own over it (an arm in front of its head goes in a third).
  So a horde is two draws a zombie, not six (or twelve, partly lit). A swing, a flail, a
  hit's flash and a camera still settling are drawn part by part: they're brief.
  Composites live in a few canvas pages; when those are full, the oldest is cleared and
  what was on it is put together again when it's next wanted.
- **Everything first, then the drawing.** Writing into a canvas the frame has already
  drawn from makes the browser copy all of it, so each frame the renderer has every
  zombie on screen (and every flying head) worked out and its sprites baked and
  composites put together (`prepare`, `ready`) before it draws any of them. The dead's
  decals are baked before the ground is drawn.
- **A head with a mind of its own.** The head is drawn at its own facing: a hunter's
  turns to what it's after before its body does, and its eyes go the rest of the way; a
  shambler's glances about, holding each look a second or two, its eyes drooping; one
  that's hit reels, eyes rolled up or crossed. Every few seconds a zombie blinks. The eye
  poses (ahead, left, right, up, down, shut, crossed) are baked like the arm poses, only
  for the facings where the eyes show; a head's silhouette is the same whatever its eyes
  do, so they share it.
- **Far to near.** Which part covers which depends on the facing and the arm poses, so
  the order is worked out per facing from small bakes of the parts in place: where two
  overlap on screen, the one that's mostly nearer the camera goes later. It matches a
  single z-buffered render of the whole body to within the outlines where parts meet.
- **Blood on its shirt.** A zombie that's been shot (and bled: a shove or a fire
  doesn't show) wears its torso's second set of sprites, bloodied low on the belly,
  out of the back and on a side: the head is big and tipped toward the camera, so
  that's the part of the torso that shows. Every other colour block has its wounds
  on the other side. The blood doesn't change the shape, so both share a silhouette.
- **Light**: sprites are baked fully lit. A partly lit zombie's composite (and its
  head) is darkened to one of ten levels as it's put together, so there's nothing
  drawn over it: see-through draws cost a canvas about three times as much. Drawn part
  by part, a zombie in the dark gets each part's black silhouette over that part at
  `1 - brightness` (silhouettes depend only on the shape, so all colours share them). A
  hit flashes it brighter.
- **The night.** Where no light reaches, every zombie is exactly as bright (one less the
  darkness), so every sprite also gets a copy darkened to that when it's baked, and the
  composites of those zombies are put together from the copies. The copies keep the rim
  light at its daylight strength, a moonlit edge that keeps a zombie readable on a dark
  street.
- **The dead fall, and lie eight ways** (`DEATHS`): on its back with its arms flung up
  in a V, out in a T, or one out and one up; on its face, reaching past its head or
  with an arm out; on its left side or its right, arms out in front. Each has its head
  turned a little and its eyes rolled up, crossed or shut, and a weight (on its back
  is the most common). Its head goes the way the shot threw it, so a body on its back
  faces the shooter, one on its face faces away, one on its side faces across. It
  goes over in three frames over a third of a second (16 facings, baked as deaths
  happen, a sample a pixel: they're on screen a tenth of a second each), then lies on
  the ground as a decal of its own look in its pose, bloodied all over, feet where it
  stood. A death whose fall can't be baked in time drops straight to the ground, lying
  as one of its look's dead already do if it can (two a frame may go past the budget,
  so a shotgun blast still drops most of a crowd over). A body that has landed holds
  its last frame a quarter of a second at most while its decal is baked within the
  budget, so a crowd going down together doesn't bake every decal in one frame.
- **Heads come off.** A common killed by one big blow (45 damage or more in one moment: a
  hunting rifle round, a shotgun blast up close, an explosion) loses its head four times
  in five, or once in five to a shotgun (`pop` in `weapons.js`: a blast up close mostly
  drops them whole). The head flies the way the blow went, tumbling, bounces off walls
  and the ground (blood where it first lands; `effects.js`), and lies face up by the
  headless body, whose neck is bloodied.

The specials (Hunter, Tank, Night Terror, the Witch) and the survivors keep their own
figures.

## Settings and cost

**Zombie lean toward camera** and **Zombie head tilt toward camera** (under Presentation,
10° and 35° by default, up to 40° and 60°) set the lean; a change bakes the sprites again
once the slider stops.
**Zombie models** (under Presentation in the tuning panel, on by default) switches the
horde back to the stick figures (`src/render/figures.js`, batched by colour), which are
drawn with very few calls for the biggest stress-test hordes: a model zombie is two
draws (three with an arm in front of its head; six or twelve part by part; the dead
are one, and a fall or a flying head one or two). The eyes, the toon shading, the rim,
the blood and the dead cost no extra draws; what they cost is baking and memory. In a
software-drawn Chromium, 200 model zombies on screen add about 5 ms to a frame by day
and 8 to 9 ms at night, the same as the stick figures; drawn part by part, as before
the composites, it was 8 and 17 to 22 ms. (Measure with the canvas made to finish
drawing inside the frame being timed: the browser otherwise finishes it whenever it
likes, inside the timing or after it, and the numbers mislead.) The dead are kept apart from the standing: the decals (one per
look, pose and head or not, as they're needed) have their own atlas pages, and fall
frames, each wanted for a tenth of a second, have small canvases of their own, only
the last 96 kept. (When they went in with the rest, every fight spread the horde's
sprites over more pages, and in a software-drawn canvas the horde drew up to three
times slower afterwards.) New sprites are baked for one zombie a frame at most, within about
4 ms, since every upload makes the browser copy an atlas page: in the first minute or
so a zombie may borrow a near facing, plain eyes or a clean shirt for a frame or two.
**Debug read-out** shows how many sprites have been baked for this camera, how long
that took, how much atlas it uses (about 2 to 4 Mpx once a horde has been around, the
dead's decals a few tenths of that), how many bodies have been put together and how much
room they take (about 3 Mpx for a horde of 200), and how many fall frames are kept.

With no lean, a zombie seen from straight above is mostly the top of its head. The lean
trades a little of the world's true perspective for their faces: they stand a little taller
on screen than the camera alone would draw them, their feet where they are.
