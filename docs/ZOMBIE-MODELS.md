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
It renders a part through the game's orthographic camera (`src/iso.js`), with smooth
shading from a light fixed to the camera, two samples a pixel each way, and texture
mipmaps.

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
  hang, reach, go up for a swing and come down on you, and flail when it's hit. The arm
  poses switch like drawn frames; the small motions are bobs.
- **Far to near.** Which part covers which depends on the facing and the arm poses, so
  the order is worked out per facing from small bakes of the parts in place: where two
  overlap on screen, the one that's mostly nearer the camera goes later. It matches a
  single z-buffered render of the whole body to within the outlines where parts meet.
- **Light**: sprites are baked fully lit. A zombie in the dark gets each part's black
  silhouette over that part at `1 - brightness` (silhouettes depend only on the shape,
  so all colours share them). A hit flashes it brighter.
- **The dead** lie on the ground as decals of their own look, on their backs with their
  arms flung up and their heads where the shot threw them.

The specials (Hunter, Tank, Night Terror, the Witch) and the survivors keep their own
figures.

## Settings and cost

**Zombie lean toward camera** and **Zombie head tilt toward camera** (under Presentation,
10° and 35° by default, up to 40° and 60°) set the lean; a change bakes the sprites again
once the slider stops.
**Zombie models** (under Presentation in the tuning panel, on by default) switches the
horde back to the stick figures (`src/render/figures.js`, batched by colour), which are
cheaper for the biggest stress-test hordes: a model zombie is six sprites, twelve in the
dark. **Debug read-out** shows how many sprites have been baked for this camera, how
long that took and how much atlas it uses (about 1 to 2 Mpx once a horde has been
around).

With no lean, a zombie seen from straight above is mostly the top of its head. The lean
trades a little of the world's true perspective for their faces: they stand a little taller
on screen than the camera alone would draw them, their feet where they are.
