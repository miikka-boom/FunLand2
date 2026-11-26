// Street litter and covers (Scenario, GPT Image, styled on the level's concept art), cut from one sheet:
// where each is in litter.webp (x, y, w, h: pixels) and how wide it lies on the ground (world units).
export const LITTER_IMAGE = 'assets/streets/litter.webp';
export const LITTER = {
  newspaper: { x: 2, y: 2, w: 166, h: 176, size: 16 },
  page: { x: 170, y: 2, w: 202, h: 164, size: 16 },
  papers: { x: 374, y: 2, w: 134, h: 115, size: 26 },
  bags: { x: 510, y: 2, w: 144, h: 144, size: 30 },
  manhole: { x: 656, y: 2, w: 172, h: 170, size: 24 },
  drain: { x: 830, y: 2, w: 222, h: 124, size: 26 },
  cardboard: { x: 2, y: 180, w: 206, h: 166, size: 26 },
  cans: { x: 210, y: 180, w: 144, h: 123, size: 14 },
};
