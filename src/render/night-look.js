// How the night looks, chosen per map type (settings: nightLook@<level>).
//
// 'classic': the dark is blue-black and the lights only take it away (what the game has always
// done).
//
// 'noir', after the second concept for Streets (the default there): dark, desaturated
// purple-grey streets so the zombies (kept bright: zombieFloor) pop out of them, warm amber
// lamp pools and flashlight, faint warm shafts across the street.
//
// 'purple', the first prototype after a concept for Streets: the dark is a saturated violet, everything
// in shadow leans purple, the warm lights (the flashlight, street lamps, fires, muzzle flashes)
// glow amber, coral where it spills onto the violet, and every street lamp throws a diagonal
// shaft of it across the ground, amber turning rose. The ground itself is violet where it was
// grey. Shadows lean purple through prims.js tone() (the walls, roofs, props and survivors),
// lighting.js (the ground: the overlay and its glow layer) and zombie-art.js (the zombies'
// darkened sprites).

import { forLevel } from '../settings.js';

export const NIGHT_LOOKS = {
  classic: null,
  noir: Object.freeze({
    id: 'noir',
    dark: '22,18,26', // the night laid over the ground (rgb), at the darkness setting's strength
    deep: '10,8,14', // what's out of the survivor's sight (line-of-sight shadows)
    shade: [40, 28, 52], // what everything standing leans toward in shadow
    shadeMix: 0.35, // ...how far, where no light reaches at all
    warm: [255, 150, 70], // the warm lights' colour
    warmMix: 0.18, // how far fully lit things lean toward it
    coral: [226, 112, 78], // ...toward the edges of their pools
    beamColor: [255, 182, 104], // the flashlight, near the lens
    pool: 0.72, // how much of a lamp's (or fire's) pool turns warm, at its core (times its strength)
    beam: 0.5, // ...and of the flashlight's beam (three cones, one over another)
    shafts: 0.16, // how strong a street lamp's diagonal shaft of light is (0: none)
    rose: [214, 120, 92], // what a shaft turns as it goes
    rim: [214, 198, 204], // the moonlit rim on the zombies in the dark
    // The zombies (and the specials) are never darker than this: they pop out of the dark.
    zombieFloor: 0.72,
    dashes: 'rgba(222,150,36,0.85)', // the road's centre line: amber
    roofs: Object.freeze(['#4d3b4e', '#544050', '#463a4c', '#4f4248', '#4a3d52', '#55464f', '#433848']),
    ground: Object.freeze({
      street: '#3c3442',
      sidewalk: '#705360',
      curb: '#86687a',
      buildings: '#463a48',
      start: '#463a48',
      end: '#463a48',
      parking: '#3e303a',
      park: '#2e3a2c',
      plaza: '#5a4a58',
      construction: '#4e3c36',
      station: '#463a48',
    }),
  }),
  purple: Object.freeze({
    id: 'purple',
    dark: '44,14,92', // the night laid over the ground (rgb), at the darkness setting's strength
    deep: '16,8,46', // what's out of the survivor's sight (line-of-sight shadows)
    shade: [70, 30, 120], // what everything standing leans toward in shadow
    shadeMix: 0.55, // ...how far, where no light reaches at all
    warm: [255, 166, 66], // the warm lights' colour
    warmMix: 0.22, // how far fully lit things lean toward it
    coral: [255, 112, 104], // ...toward the edges of their pools
    beamColor: [255, 200, 96], // the flashlight, near the lens
    pool: 0.8, // how much of a lamp's (or fire's) pool turns warm, at its core (times its strength)
    beam: 0.55, // ...and of the flashlight's beam (three cones, one over another)
    shafts: 0.34, // how strong a street lamp's diagonal shaft of light is (0: none)
    rose: [255, 92, 140], // what a shaft turns as it goes
    rim: [236, 206, 255], // the moonlit rim on the zombies in the dark: lavender
    // Lilac roofs in place of the grey ones (each grey always becomes the same one).
    roofs: Object.freeze(['#7541b2', '#6c4a9e', '#7a4f9a', '#663f9c', '#7d4aa8', '#6a5096', '#744a8c']),
    ground: Object.freeze({
      street: '#4a2c66',
      sidewalk: '#6a3f86',
      curb: '#7d529a',
      buildings: '#3e2a55',
      start: '#3e2a55',
      end: '#3e2a55',
      parking: '#432a5e',
      park: '#2a3a2e',
      plaza: '#5a3f72',
      construction: '#5a3a3e',
      station: '#46305e',
    }),
  }),
};

/** This frame's night look for the map being played: null by day or with the classic look. */
export function nightLookFor(S) {
  if (!S.night) return null;
  const id = forLevel(S, 'nightLook');
  return (Object.hasOwn(NIGHT_LOOKS, id) && NIGHT_LOOKS[id]) || null;
}

/** rgb triple -> 'r,g,b' */
export const rgb = (c) => `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
