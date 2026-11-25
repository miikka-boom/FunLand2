// What a common infected looks like: one of the artist's zombie models (assets/zombies/, drawn by
// src/render/zombie-art.js). A look is a body, a head and a colour block of the texture:
//   body   'normal', or 'big' (the heavy one; it only takes its own head)
//   head   bald, baldB (the same, mouth a little to one side), ponytail, swept (a side fringe),
//          wide (a bigger skull, eyes further out); wideBig goes on the big body
//   block  A light shirt, grey trousers, green skin    B light shirt, brown trousers, green skin
//          C beige shirt, dark trousers, grey skin     D tan shirt, dark trousers, pale skin
// The first six are the zombies as the artist made them; the rest put their heads in the other
// colours, so a crowd has a few more faces in it. weight: how often it turns up.

export const LOOKS = [
  { body: 'normal', head: 'bald', block: 'A', weight: 3 },
  { body: 'normal', head: 'baldB', block: 'B', weight: 3 },
  { body: 'normal', head: 'ponytail', block: 'A', weight: 3 },
  { body: 'normal', head: 'swept', block: 'B', weight: 3 },
  { body: 'normal', head: 'wide', block: 'C', weight: 3 },
  { body: 'big', head: 'wideBig', block: 'D', weight: 2 },
  { body: 'normal', head: 'ponytail', block: 'D', weight: 1 },
  { body: 'normal', head: 'swept', block: 'C', weight: 1 },
  { body: 'normal', head: 'bald', block: 'D', weight: 1 },
  { body: 'normal', head: 'wide', block: 'B', weight: 1 },
  { body: 'normal', head: 'swept', block: 'A', weight: 1 },
  { body: 'normal', head: 'ponytail', block: 'C', weight: 1 },
];

const TOTAL = LOOKS.reduce((s, l) => s + l.weight, 0);

/** A look index, by weight (r: a number in [0, 1)). */
export function pickLook(r = Math.random()) {
  let x = r * TOTAL;
  for (let i = 0; i < LOOKS.length; i++) {
    x -= LOOKS[i].weight;
    if (x < 0) return i;
  }
  return LOOKS.length - 1;
}
