# Streets: the art after the concept

The Streets level is drawn after the second concept for it: dark, desaturated streets so the
bright zombies pop, warm amber lamp pools and flashlight, textured ground and roofs, brick
facades, rooftop clutter, papers strewn about, chunky parked cars, iron lamp posts and parks
with benches, fountains and trees, all inked.

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
| `trees.webp` + `trees.js` | Six bare street trees and six park trees (four leafy, an autumn one, a pine), standing | the same, two sheets |
| `grass.webp` | The parks' lawn (grey: only its light and dark are used) | Scenario Texture, seam erased |

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
phone). A turned camera (the 45-degree view) gets chunks that are squares of the screen instead,
each painted with the world under it (the Building's floors use the same: docs/BUILDING-ART.md);
the themed maps and the docks paint the ground as before. Moving decor (lore, Ben, docks,
themes) is drawn over it each frame.

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

## Street furniture (world/street-furniture.js)

Bare trees in stone planters along the curbs (a few to a block: about 90 a map), pairs of
newspaper boxes near the corners and bus shelters on the longer stretches, each facing the
street (`heading`). They are the very last
thing done to a map (`game.js` newRun, after the features, the finds, the Witch, the lore and
Ben), from a random stream of their own, so nothing else moves; they keep off the crossings, the
lamps, medkits, doorways, boarded rooms' fronts, stashes and anything written on the ground,
and stand clear of everything already there. You walk round them; shots and sight pass. If they
ever cut the safe room, a find or a boarded room's door off from the start, newRun takes them all
out again.

- Newspaper boxes and bus shelters are 3D models like the car (`prop-art.js` holds all three:
  `PROPS`), each fitted to its footprint and turned to its heading; a newspaper box's green paint
  is swapped for its own colour.
- A bare tree: its planter drawn as a box, the tree a sprite standing up from it (Trees, below).

## Fire escapes (models.js fireEscape)

On the wall that faces the camera of most buildings of three floors or more (from their seed):
an iron platform under each upper floor's windows with its railing, ladders zigzagging up between
them, a drop ladder from the lowest. Drawn as see-through iron (frames, grating bars, rails and
rungs, each a dark line under a lighter one), lit as that wall is, as part of the building.

## Leaning toward the camera (prop-art.js `tilt`)

The camera looks down steeply (75 degrees), and from there a tall thing shows little more than
its top: a lamp post was a dot, a fountain rings. So, as the zombies lean toward the camera
(`zombieLean`), props can: each is baked as if the camera were `tilt` degrees lower (lamp 15,
bench 12, fountain 22; not below 35 degrees, where sides show anyway), pivoting where it stands.
`offsetOf` finds where a point of the model lands on screen as it is drawn (a lamp's lantern,
for its glow).

## Street lamps

The 3D model (a cast-iron post with a shepherd's crook arm and a lantern, `lamp`) in place of the
old post, its arm out over the nearest street. Lit lamps keep their light pools; the glow and a
bright pane are drawn on the lantern where the leaning model puts it.

## Parks

- Trees stand up on screen, as the concept draws them: a sprite from the sheet, upright from its
  trunk's foot at the tree's spot, a little shorter from a steeper camera (`standScale`), its
  top swaying. The parks' are leafy (now and then an autumn tree or a pine) and cast a round
  shadow; the streets' are bare. A standing sprite reaches far past its footprint on screen, so
  the scene culls it by its height there (`cullH`), orders zombies against its width (`wide`),
  and fades it when its crown is over the survivor (`billHides`: what stands behind its foot and
  under its crown); a leafy crown also gets zombies behind it outlined, as walls do.
- Benches (`bench`): face into the park, set at a slant of 20 to 30 degrees either way, so the
  seat and the back read; a round shadow along them.
- Fountains: the basin drawn round and inked, its water rippling out from the middle; the centre
  piece (`fountain`: plinth, bowls, a pinecone) a model of its own, half the basin wide,
  standing in the water and leaning toward the camera (22 degrees).
- Railings (`fence` with `iron`, the parks' only): see-through wrought iron as the fire escapes
  are drawn, bars between two rails, their tips proud of the top one, capped posts.
- Grass: the lawn texture over the park's colour, in the ground cache. The fallen leaves the
  parks had are no longer drawn over it (it has a few of its own).

## Making more

- A new surface: Scenario Texture with a concept crop as `referenceImages`, `eraseSeam: true`;
  check a 2x2 self-tile; save a 1024 px WebP in assets/streets and add it to `textures.js`.
- New sprites: GPT Image with `background: "transparent"`, a grid of pieces with space between
  them, a concept crop as reference; cut by alpha and pack (pieces in reading order, each with a
  size in world units), as `rooftop.js` and `litter.js` are.
- A new 3D prop: a concept image on a plain background (three-quarter view; paint it green if
  its colour is to vary), image-to-3D with a low face limit and no PBR, then
  `tools/props/build_props.py <name> <glb>` (`--axis short` if it faces across its length,
  `--front x+` to name the GLB's axis it faces along, `--size` for its longer side or
  `--height` for its height in model units, `--pivot base` to stand it on its foot rather than
  its middle, `--specks 100` to drop stray bits, `--flip` if its front comes out behind: bake it
  from the four sides to check), and an entry in `PROPS` (with a `tilt` if it is tall).
- Standing sprites (trees): a transparent sheet, cut by alpha with each piece's trunk foot
  found from its bottom rows; heights in world units in `trees.js`.
