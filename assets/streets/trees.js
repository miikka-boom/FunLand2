// Standing trees (Scenario, GPT Image, styled on the level's concept art), cut from two sheets:
// bare street trees and the parks' leafy ones, each drawn upright from where its trunk meets the
// ground, as the concept draws them. x, y, w, h: where it is in trees.webp (pixels); ax: its
// trunk's foot, pixels from its left; height: how tall it stands (world units).
export const TREES_IMAGE = 'assets/streets/trees.webp';
export const BARE_TREES = {
  bare1: { x: 2, y: 2, w: 128, h: 214, ax: 64.0, height: 62 },
  bare2: { x: 132, y: 2, w: 268, h: 207, ax: 125.5, height: 66 },
  bare3: { x: 402, y: 2, w: 104, h: 218, ax: 54.5, height: 70 },
  bare4: { x: 508, y: 2, w: 146, h: 216, ax: 46.5, height: 60 },
  bare5: { x: 656, y: 2, w: 192, h: 208, ax: 102.5, height: 64 },
  bare6: { x: 850, y: 2, w: 194, h: 216, ax: 108.5, height: 62 },
};
export const PARK_TREES = {
  oak: { x: 1046, y: 2, w: 220, h: 234, ax: 113.0, height: 92 },
  elm: { x: 2, y: 238, w: 210, h: 234, ax: 99.5, height: 88 },
  maple: { x: 214, y: 238, w: 230, h: 232, ax: 117.0, height: 94 },
  linden: { x: 446, y: 238, w: 202, h: 232, ax: 99.5, height: 86 },
  autumn: { x: 650, y: 238, w: 228, h: 237, ax: 120.5, height: 90 },
  pine: { x: 880, y: 238, w: 197, h: 242, ax: 98.5, height: 98 },
};
