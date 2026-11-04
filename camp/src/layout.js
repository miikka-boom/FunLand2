// Where things sit in the camp panorama. World units are CSS pixels at
// scale 1. Back-row plots sit on y = 196, the front row on y = 284
// (bottom-centre anchors). The world is scaled so the band from BAND.top to
// BAND.bottom fits between the top and bottom HUD bars; sky and ground run
// on under the HUD.

export const WORLD = { w: 1560, h: 400, horizon: 150 };
export const BAND = { top: 40, bottom: 300 };

export const PLOTS = {
  radio: { x: 150, y: 196 },
  hq: { x: 322, y: 200 },
  warehouse: { x: 512, y: 196 },
  armory: { x: 684, y: 196 },
  bunkhouse: { x: 862, y: 196 },
  garden: { x: 222, y: 284 },
  lumber: { x: 604, y: 284 },
  scrapyard: { x: 800, y: 284 },
  infirmary: { x: 1062, y: 198 },
  garage: { x: 1176, y: 284 },
  workshop: { x: 1418, y: 280 },
};

/** Collect-bubble height on producers, as a fraction of the art box from the top. */
export const BUBBLE_Y = { garden: 0.58, lumber: 0.5, scrapyard: 0.52 };

export const CAMPFIRE = { x: 426, y: 280 };

/** Where the wait rewards appear in the camp when they are ready. */
export const DROPS = { short: { x: 66, y: 262 }, long: { x: 508, y: 262 } };

/** Rubble piles cover an area until cleared; x0..x1 is the area they free up. */
export const RUBBLE_AT = {
  east: { x: 1134, y: 284, x0: 980, x1: 1292 },
  far: { x: 1420, y: 286, x0: 1292, x1: 1560 },
};

/** Right edge of the usable camp, given which areas are cleared. */
export function campEdge(rubble) {
  if (rubble.east.done && rubble.far.done) return WORLD.w - 24;
  if (rubble.east.done) return RUBBLE_AT.far.x0;
  return RUBBLE_AT.east.x0;
}

/** Band where idle survivors wander (world units). */
export const WALK = { y0: 214, y1: 298, x0: 110 };
