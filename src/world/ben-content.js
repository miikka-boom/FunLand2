// We Left Ben: what Ben (and the squad, about Ben) left in the world.
//
// The squad (Odile, Teo, Mags, Lou, Biscuit the dog, and you) left the first
// safe room on day 2. Ben wasn't with them. Since then there have been signs:
// small lowercase words in orange crayon, a stuffed rabbit with sewn-on eyes,
// and two little eyes scratched near vents and hidden ways through. The eyes
// always look at something.
//
// Nothing here explains who Ben is, how he got where he got, or whose side
// he's on. Keep it that way: every line should raise a question. Everything is
// drawn in the world (no inspect text), so every player sees the same signs.

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

/** One squad page per level, written out on the floor beside it: a piece of what happened, never the whole thing. */
export const BEN_NOTES = {
  city: [{ text: 'DAY 2. WE LEFT BEN. — O.', who: 'odile' }],
  interior: [
    { text: 'WHISTLING IN THE DUCTS — MAGS', who: 'mags' },
    { text: "IT'S THE PIPES — TEO", who: 'teo' },
  ],
  docks: [{ text: 'SOMEONE WAVED FROM CRANE 3 — LOU', who: 'lou' }],
};

/** His bed. */
export const BEN_NEST = {
  light: 'i left the light on.',
  // Lines that only turn up after you've been here before (cross-run memory).
  again: 'you found my bed again.',
  rabbit: "ok. you can stay. don't touch the rabbit.",
};

/** Lines in the first room that know what you did on earlier runs. */
export const BEN_KNOWS = {
  back: 'you got out. why come back?',
  died: (n) => `you died ${n} times. i counted.`,
};

/** Beside arrows that point straight at the noise. */
export const BEN_NOISE = "don't follow the noise";

/** The Tinkerer, next to their mark (which has a second eye now). */
export const TINKERER_ON_BEN = 'STOP ADDING EYES TO MY MARK — T.';

/** His chalk drawing by his bed: the squad holding hands, and one more. */
export const SQUAD_DRAWING = { names: ['ODILE', 'TEO', 'MAGS', 'LOU', 'YOU'], dog: 'BISCUIT' };
