# Building: the Dollhouse look

The Building level is drawn after its "Dollhouse" concept: the floor of an office-and-clinic
building cut open at waist height, so the floor plan reads at a glance. Light, clean floors (a
different one for each kind of room), light walls with solid black cut tops, and chunky,
softly shaded furniture. The lights are the game's own, as before: the night's dark, the
ceiling lights, the flashlight.

Everything new was made with Scenario (the Boom Corp team): the floors with Scenario Texture
from crops of the concept, the furniture as a concept image per piece, then image-to-3D.

## Floors (renderer.js FLOORS, assets/building)

| Texture | Where | Colour |
| --- | --- | --- |
| `tiles.webp` (square tiles, four by four a repeat) | corridors, offices, the cafeteria (every other tile darker), safe rooms (green); small in restrooms, big in the lobby | light grey, greige, cream and taupe, pale blue, sand |
| `carpet.webp` | open offices, conference rooms | slate blue-grey, muted plum |
| `lino.webp` | wards, labs | teal, pale grey-green |
| `concrete.webp` | warehouses, storerooms, closets | warm greys |

As on the streets, a texture is used for its detail only, tinted to its floor's colour
(textures.js), and the floors are painted once into the ground cache (ground-cache.js), which
now also takes a turned camera like the Building's: its chunks are squares of the screen, each
painted with the world under it. So the textured floors cost no more a frame than the flat ones
did (the Streets' 45-degree camera gets the cache too).

## Walls (models.js)

Indoors every wall, glass wall and pillar has a solid black top (`CUT_TOP`), its faces a light
version of its old colour (`DOLLHOUSE_WALLS`: plain walls warm light grey, the outer shell a
little darker, the safe rooms light green) over a dark skirting board, all lit by the light in
front of them as before. Glass walls have a sill in the wall's colour, pale panes and dark
mullions. Counters have a light laminate top on a wood front; conference tables are wood.

## Furniture (prop-art.js, assets/props)

| Model | Footprint | Faces |
| --- | --- | --- |
| `desk` (monitor, keyboard, papers, a mug, drawers) | 64 x 34; an open office's 128-long desk is two side by side | into its room, away from the nearest wall |
| `chair` (office swivel chair) | the decor chairs left about the floor | one of sixteen ways |
| `cabinet` (three-drawer filing cabinet, deeper than wide) | 30 x 22 | into its room along its long side |
| `bed` (hospital bed, white sheet, blue blanket) | 92 x 46 | its foot toward the middle of the ward |
| `shelf` (steel shelving bay with boxes and crates) | 110 x 26; a warehouse run is one bay after another | into its room |
| `plant` | 24 x 24, its leaves spreading past its pot | turned by its place |
| `vending` (drinks machine) | 40 x 30 | into its room |
| `couch`, `armchair` (maroon) | a sofa on a long footprint, an armchair on a small square, two sofas back to back on a big square | into the room; the pair face out |
| `table` (cafeteria table with four chairs) | 74 x 44, its chairs past the table | along its length |

They are baked like the street props (zombie-bake.js through the game's camera, one sprite per
heading and size, darkened to the light where they stand), built with
`tools/props/build_props.py --shell 0`: no ink outline, as the concept has none. Each leans a
little toward the steep camera (6 to 16 degrees, the tall ones most), so a desk shows its
monitor and drawers and a vending machine its front. Until a model has loaded a piece is drawn
in boxes as before. Built with:

```
python3 tools/props/build_props.py desk tools/props/source/desk.glb --axis short --shell 0
python3 tools/props/build_props.py chair tools/props/source/chair.glb --size 160 --shell 0
python3 tools/props/build_props.py cabinet tools/props/source/cabinet.glb --flip --shell 0
python3 tools/props/build_props.py bed tools/props/source/bed.glb --shell 0
python3 tools/props/build_props.py shelf tools/props/source/shelf.glb --axis short --shell 0
python3 tools/props/build_props.py plant tools/props/source/plant.glb --shell 0
python3 tools/props/build_props.py vending tools/props/source/vending.glb --axis short --flip --shell 0
python3 tools/props/build_props.py couch tools/props/source/couch.glb --axis short --shell 0
python3 tools/props/build_props.py table tools/props/source/table.glb --shell 0
python3 tools/props/build_props.py armchair tools/props/source/armchair.glb --axis short --shell 0
```

Check a model's front with a bake from four sides before using it (the forward axis is the one
that faces the camera at a heading of a right angle to it): Tripo's models come facing either
way, and nearly square ones (a chair, an armchair) can be read along the wrong axis.

Still drawn the old way: crates, barrels, the barricades of piled furniture (in the new colours),
the boarded doorways.
