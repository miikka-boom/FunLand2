// We Left Ben: what Ben (and the squad, about Ben) left in the world.
//
// The squad (Odile, Teo, Mags, Lou, Biscuit the dog, and you) left the first
// safe room on day 2. Ben wasn't with them. Since then there have been signs:
// small lowercase words in orange crayon, a stuffed rabbit with sewn-on eyes,
// and two little eyes scratched near vents and hidden ways through. The eyes
// always look at something.
//
// Nothing here explains who Ben is, how he got where he got, or whose side
// he's on. Keep it that way: every line should raise a question.

/** Ben's crayon. */
export const BEN_COLOR = '#ff8a1e';

/** Somewhere nobody could have written it. */
export const BEN_WAS_HERE = {
  roof: 'ben was here',
  shelf: 'ben was here',
  sealed: 'ben was here',
  container: 'ben was here too',
  boom: 'ben was here. day 1.',
  buoy: 'ben was here',
  ferry: 'ben was here',
};

/** The first room of every run, under the squad's "DAY 1 HERE. DAY 2 LEAVING." */
export const BEN_START = 'day 3. you left.';

/** The squad about Ben (in their own spray / marker), and what turns up underneath in orange. */
export const SQUAD_ON_BEN = [
  { text: 'BEN?', reply: 'here' },
  { text: 'SORRY BEN', reply: "it's ok" },
  { text: "WE SHOULD'VE WAITED — O.", reply: 'you should have' },
  { text: 'BEN KNOWS THE WAY — TEO', reply: 'i do' },
  { text: 'NOBODY TALKS ABOUT BEN — LOU', reply: 'lou does. at night.' },
  { text: 'BEN, IF YOU READ THIS: PIER 9', reply: 'i was there first' },
  { text: 'THE BLINKING LAMP SPELLS SOMETHING — O.', reply: null },
];

/** One squad page per level: a piece of what happened, never the whole thing. */
export const BEN_NOTES = {
  city: {
    label: 'JOURNAL PAGE',
    text: 'Day 2. Ben said he heard something in the vents and went to look. We counted to a hundred. Lou said we had to go. We left Ben. — Odile',
  },
  interior: {
    label: 'NOTE',
    text: "MAGS: whistling in the ducts again. TEO: it's the pipes. MAGS: pipes don't know that song.",
  },
  docks: {
    label: 'NOTE',
    text: 'Saw someone up on crane 3 last night. Waved. It waved back. Not telling the others. — Lou',
  },
};

/** His bed. */
export const BEN_NEST = {
  fort: { label: 'A BED', text: 'Cardboard walls. A blanket folded into a perfect square. Still warm.' },
  light: 'i left the light on.',
  tally: 'nights slept',
  // Lines that only turn up after you've been here before (cross-run memory).
  again: 'you found my bed again.',
  rabbit: "ok. you can stay. don't touch the rabbit.",
};

/** Lines in the first room that know what you did on earlier runs. */
export const BEN_KNOWS = {
  back: 'you got out. why come back?',
  died: (n) => `you died ${n} times. i counted.`,
};

/** Captions (what you read when you walk up). */
export const BEN_CAPTIONS = {
  eyes: [
    "Two little eyes, scratched in. They're looking at something.",
    'The eyes again.',
    'Fresh scratches. The eyes look that way.',
    'Two more eyes. Still looking.',
  ],
  eyesFresh: 'Two little eyes, scratched just now. The dust is still settling.',
  rabbit: { label: 'A STUFFED RABBIT', text: 'One ear chewed. Someone sewed new eyes on it.' },
  rabbitNest: { label: 'A STUFFED RABBIT', text: 'Same chewed ear. Same new eyes.' },
  vent: { label: 'A VENT', text: 'The grate is off. Its screws are lined up on the floor in a neat little row.' },
  footprints: { label: 'FOOTPRINTS', text: 'Small shoes. They walk up to the wall and stop.' },
  noise: "don't follow the noise",
  rollcall: 'Under the roll call, in orange crayon: ben ✓',
  tinkerer: 'SOMEONE KEEPS ADDING AN EYE TO MY MARK. NOT FUNNY. — T.',
  label: 'IN ORANGE CRAYON',
  reply: 'UNDERNEATH, IN ORANGE',
};

/** The drawing on his wall: the squad holding hands, and one more. */
export const SQUAD_DRAWING = { names: ['ODILE', 'TEO', 'MAGS', 'LOU', 'YOU'], dog: 'BISCUIT' };
