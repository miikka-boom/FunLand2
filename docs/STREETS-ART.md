# Streets: the art after the concept

The Streets level is drawn after the second concept for it: dark, desaturated streets so the
bright zombies pop, warm amber lamp pools and flashlight, textured ground and roofs, brick
facades, rooftop clutter, papers strewn about and chunky parked cars, all inked.

Everything new was made with Scenario (the Boom Corp team), using crops of the concept as style
references, and is painted into caches so it costs no more per frame than the flat streets did.

## The look (night-look.js)

`noir`, the Streets default (Night look (this map) under Presentation switches it per map type):

- The dark over the ground is a dark purple-grey at the Darkness setting's strength; shadows
  lean toward a muted violet in `tone()` (walls, props, survivors) and in the zombies' sprites.
- Zombies and the specials (not the Night Terror) never go darker than `zombieFloor` (0.72), so
  they stand out of the dark. Out of the survivor's sight they are hidden as before.
- Warm lights turn what is left of the dark at their cores amber and coral toward their rims;
  street lamps lay a faint diagonal shaft. All on the one light overlay (`lighting.js`): a second
  full-screen layer costs about 5 ms a frame where the canvas has no GPU.
- Its own ground, roof and facade colours, and an amber centre line.

## Textures (assets/streets)

| File | What | Made with |
| --- | --- | --- |
| `asphalt.webp`, `sidewalk.webp`, `roof.webp`, `brick.webp` | Seamless 1024 px surfaces | Scenario Texture (GPT Image, seam erased), a concept crop as reference |
| `rooftop.webp` + `rooftop.js` | AC unit, vent, skylight, hatch, mushroom vent, condenser, chimney, water tank | GPT Image 2.5, one transparent sheet, cut by alpha |
| `litter.webp` + `litter.js` | Newspapers, a page, loose papers, trash bags, manhole and drain covers, cardboard, cans | the same |

`textures.js` loads them. A surface's texture is used for its detail only: it is tinted to the
surface's colour (`tintPixels`: the colour times the texture's luminance over its mean), so each
night look keeps its palette. Brick is multiplied over a wall's own colour and light.

## The ground cache (ground-cache.js)

Repeating textures cost about 20 ms a frame to fill a phone screen with on a canvas without a
GPU. So the static ground (surfaces, curbs, markings, the decor that lies still, the litter) is
painted once into 160-unit chunks of the map at the camera's scale and copied to the screen one
to one on whole device pixels each frame. Chunks start at rounded pixels of the whole map, so
neighbours meet exactly; each is painted a little past its edges so no half-covered pixel shows
as a seam; one off-screen chunk is painted ahead each frame; 56 are kept (about 16 MB on a
phone). It needs a camera that looks along the streets (the ground maps to the screen by a scale
and a shift); a turned camera, and the other maps, paint the ground as before. Moving decor
(lore, Ben, docks, themes) is drawn over it each frame.

## Roofs (roof-cache.js)

A flat roof is lit evenly, so it is painted once into a picture of its own (textured surface,
inked parapet, inner walls, its clutter) by the same drawing code through a copy of the camera
moved to the roof's corner, and copied on whole pixels inside the building's own draw call, so it
stays depth-sorted. Gable roofs (whose end walls catch moving lights) and roofs with lettering
are drawn as before. The clutter is placed from the building's seed (`rooftopProps`), more on
bigger roofs, never overlapping, and darkened to the roof's light. 5 Mpx budget.

## Parked cars (prop-art.js)

A real 3D model: a GPT Image concept of a boxy 80s sedan (painted green, a colour nothing else on
a car is), then Tripo 3.1 image-to-3D (low poly, 5.6k triangles, delit texture).
`tools/props/build_props.py car tools/props/source/car.glb` turns the GLB into the zombies' mesh
format: axes (a forward, c right, h up), a tenth of a world unit per model unit, the front found
from where the cabin sits, and an outline shell on every triangle coloured from a black band
added to the texture. `prop-art.js` bakes it with the zombies' baker (`zombie-bake.js`) through
the game's camera: a sprite per colour, side and camera, baked when first wanted (about 6 ms of
baking a frame at most), the paint swapped for each car's colour by hue (`recolorPaint`), drawn
as bright as the light where the car stands from darkened copies. Box trucks and wrecks are drawn
as before.

## Making more

- A new surface: Scenario Texture with a concept crop as `referenceImages`, `eraseSeam: true`;
  check a 2x2 self-tile; save a 1024 px WebP in assets/streets and add it to `textures.js`.
- New sprites: GPT Image with `background: "transparent"`, a grid of pieces with space between
  them, a concept crop as reference; cut by alpha and pack (pieces in reading order, each with a
  size in world units), as `rooftop.js` and `litter.js` are.
- A new 3D prop: a concept image on a plain background (three-quarter view), image-to-3D with a
  low face limit and no PBR, then `tools/props/build_props.py <name> <glb>`.
